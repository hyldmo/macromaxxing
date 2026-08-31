import { newId, pushSubscriptions, restNotificationJobs, type TypeIDString, users, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'
import { pushErrorStatus, sendWebPush } from '../web-push'

const MAX_REST_MS = 15 * 60 * 1000
const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10
const PUSH_EXPIRY_GRACE_MS = 30 * 1000
const SUBSCRIPTION_REGISTRATION_COOLDOWN_MS = 1000
const TEST_NOTIFICATION_COOLDOWN_MS = 10 * 1000
const TRUSTED_PUSH_DOMAINS = [
	'fcm.googleapis.com',
	'notify.windows.com',
	'push.samsungosp.com',
	'push.services.mozilla.com',
	'web.push.apple.com'
]

function isTrustedPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint)
		if (url.username || url.password || (url.port && url.port !== '443')) return false
		return TRUSTED_PUSH_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
	} catch {
		return false
	}
}

const subscriptionInput = z.object({
	endpoint: z.url().startsWith('https://').max(2048).refine(isTrustedPushEndpoint, 'Unsupported push service'),
	keys: z.object({
		p256dh: z
			.string()
			.min(1)
			.max(256)
			.regex(/^[A-Za-z0-9_-]+={0,2}$/),
		auth: z
			.string()
			.min(1)
			.max(256)
			.regex(/^[A-Za-z0-9_-]+={0,2}$/)
	})
})

const scheduleRestInput = z.object({
	restId: zodTypeID('rnj'),
	sessionId: zodTypeID('wks'),
	subscriptionId: zodTypeID('psb'),
	remainingMs: z.number().int().positive().max(MAX_REST_MS)
})

const cancelRestInput = scheduleRestInput.pick({ restId: true, sessionId: true, subscriptionId: true })

function vapidConfig(env: Cloudflare.Env) {
	if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)) {
		throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Rest alerts are not configured' })
	}
	return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
}

export const restNotificationsRouter = router({
	publicKey: protectedProcedure.query(({ ctx }) => {
		if (!ctx.env.VAPID_PUBLIC_KEY) {
			throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Rest alerts are not configured' })
		}
		return { publicKey: ctx.env.VAPID_PUBLIC_KEY }
	}),

	registerSubscription: protectedProcedure.input(subscriptionInput).mutation(async ({ ctx, input }) => {
		const existing = await ctx.db.query.pushSubscriptions.findFirst({ where: { endpoint: input.endpoint } })
		const now = Date.now()
		if (existing?.userId !== ctx.user.id) {
			const [claimed] = await ctx.db
				.update(users)
				.set({ lastPushSubscriptionAt: now })
				.where(
					and(
						eq(users.id, ctx.user.id),
						or(
							isNull(users.lastPushSubscriptionAt),
							lt(users.lastPushSubscriptionAt, now - SUBSCRIPTION_REGISTRATION_COOLDOWN_MS)
						)
					)
				)
				.returning({ id: users.id })
			if (!claimed) {
				throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Wait before registering another device' })
			}
			const subscriptionCount = await ctx.db.$count(pushSubscriptions, eq(pushSubscriptions.userId, ctx.user.id))
			if (subscriptionCount >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
				throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Too many registered devices' })
			}
		}
		if (existing && existing.userId !== ctx.user.id) {
			await ctx.db
				.update(restNotificationJobs)
				.set({ status: 'cancelled', updatedAt: now })
				.where(
					and(
						eq(restNotificationJobs.subscriptionId, existing.id),
						eq(restNotificationJobs.status, 'scheduled')
					)
				)
		}

		const [subscription] = await ctx.db
			.insert(pushSubscriptions)
			.values({
				userId: ctx.user.id,
				endpoint: input.endpoint,
				p256dh: input.keys.p256dh,
				auth: input.keys.auth,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: pushSubscriptions.endpoint,
				set: {
					userId: ctx.user.id,
					p256dh: input.keys.p256dh,
					auth: input.keys.auth,
					updatedAt: now
				}
			})
			.returning({ id: pushSubscriptions.id })
		if (!subscription) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
		console.info('push_subscription_registered', { subscriptionId: subscription.id })
		return subscription
	}),

	unregisterSubscription: protectedProcedure
		.input(z.object({ subscriptionId: zodTypeID('psb') }))
		.mutation(async ({ ctx, input }) => {
			const subscription = await ctx.db.query.pushSubscriptions.findFirst({
				where: { id: input.subscriptionId }
			})
			if (!subscription || subscription.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' })
			}
			await ctx.db
				.update(restNotificationJobs)
				.set({ status: 'cancelled', updatedAt: Date.now() })
				.where(
					and(
						eq(restNotificationJobs.subscriptionId, subscription.id),
						eq(restNotificationJobs.userId, ctx.user.id),
						eq(restNotificationJobs.status, 'scheduled')
					)
				)
			await ctx.db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.userId, ctx.user.id)))
			console.info('push_subscription_unregistered', { subscriptionId: subscription.id })
			return { ok: true }
		}),

	scheduleRest: protectedProcedure.input(scheduleRestInput).mutation(async ({ ctx, input }) => {
		const [session, subscription, found] = await Promise.all([
			ctx.db.query.workoutSessions.findFirst({ where: { id: input.sessionId } }),
			ctx.db.query.pushSubscriptions.findFirst({ where: { id: input.subscriptionId } }),
			ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
		])
		if (!session || session.userId !== ctx.user.id || session.completedAt !== null) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
		}
		if (!subscription || subscription.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' })
		}

		let existing = found
		const validateExisting = () => {
			if (!existing) return false
			if (existing.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification not found' })
			}
			if (existing.sessionId !== input.sessionId || existing.subscriptionId !== input.subscriptionId) {
				throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification identity is already in use' })
			}
			if (existing.status === 'scheduled' && existing.queuedAt !== null) return true
			if (existing.status !== 'scheduled') {
				throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification is no longer active' })
			}
			return false
		}
		if (validateExisting()) return { accepted: true }

		const now = Date.now()
		let dueAt = existing?.dueAt ?? now + input.remainingMs
		const expiresAt = existing?.expiresAt ?? dueAt + PUSH_EXPIRY_GRACE_MS
		if (dueAt <= now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rest has already ended' })
		if (!existing) {
			const [inserted] = await ctx.db
				.insert(restNotificationJobs)
				.values({
					id: input.restId,
					userId: ctx.user.id,
					sessionId: input.sessionId,
					subscriptionId: input.subscriptionId,
					dueAt,
					expiresAt,
					status: 'scheduled',
					queuedAt: null,
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoNothing()
				.returning({ id: restNotificationJobs.id })
			if (!inserted) {
				existing = await ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
				if (!existing) throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification changed' })
				if (validateExisting()) return { accepted: true }
				dueAt = existing.dueAt
			}
		}

		try {
			await ctx.env.REST_NOTIFICATION_QUEUE.send(
				{ jobId: input.restId },
				{ delaySeconds: Math.max(0, Math.ceil((dueAt - Date.now()) / 1000)) }
			)
		} catch (error) {
			console.error('rest_notification_queue_failed', { jobId: input.restId })
			// biome-ignore lint/nursery/useErrorCause: TRPCError receives the original cause through its options.
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Could not schedule rest alert',
				cause: error
			})
		}

		await ctx.db
			.update(restNotificationJobs)
			.set({ queuedAt: Date.now(), updatedAt: Date.now() })
			.where(
				and(
					eq(restNotificationJobs.id, input.restId),
					eq(restNotificationJobs.userId, ctx.user.id),
					eq(restNotificationJobs.status, 'scheduled')
				)
			)
		console.info('rest_notification_scheduled', {
			jobId: input.restId,
			subscriptionId: input.subscriptionId
		})
		return { accepted: true }
	}),

	cancelRest: protectedProcedure.input(cancelRestInput).mutation(async ({ ctx, input }) => {
		const job = await ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
		if (job && job.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification not found' })
		}
		if (job && (job.sessionId !== input.sessionId || job.subscriptionId !== input.subscriptionId)) {
			throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification identity is already in use' })
		}
		const now = Date.now()
		if (!job) {
			const [session, subscription] = await Promise.all([
				ctx.db.query.workoutSessions.findFirst({ where: { id: input.sessionId } }),
				ctx.db.query.pushSubscriptions.findFirst({ where: { id: input.subscriptionId } })
			])
			if (!session || session.userId !== ctx.user.id || !subscription || subscription.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification context not found' })
			}
			const [inserted] = await ctx.db
				.insert(restNotificationJobs)
				.values({
					id: input.restId,
					userId: ctx.user.id,
					sessionId: input.sessionId,
					subscriptionId: input.subscriptionId,
					dueAt: now,
					expiresAt: now,
					status: 'cancelled',
					queuedAt: null,
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoNothing()
				.returning({ id: restNotificationJobs.id })
			if (!inserted) {
				const concurrentJob = await ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
				if (!concurrentJob || concurrentJob.userId !== ctx.user.id) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification not found' })
				}
				if (
					concurrentJob.sessionId !== input.sessionId ||
					concurrentJob.subscriptionId !== input.subscriptionId
				) {
					throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification identity is already in use' })
				}
			}
		}
		await ctx.db
			.update(restNotificationJobs)
			.set({ status: 'cancelled', updatedAt: now })
			.where(
				and(
					eq(restNotificationJobs.id, input.restId),
					eq(restNotificationJobs.userId, ctx.user.id),
					eq(restNotificationJobs.sessionId, input.sessionId),
					eq(restNotificationJobs.subscriptionId, input.subscriptionId),
					eq(restNotificationJobs.status, 'scheduled')
				)
			)
		console.info('rest_notification_cancelled', { jobId: input.restId })
		return { ok: true }
	}),

	sendTestNotification: protectedProcedure
		.input(z.object({ subscriptionId: zodTypeID('psb') }))
		.mutation(async ({ ctx, input }) => {
			const subscription = await ctx.db.query.pushSubscriptions.findFirst({
				where: { id: input.subscriptionId }
			})
			if (!subscription || subscription.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' })
			}
			const now = Date.now()
			const [claimed] = await ctx.db
				.update(users)
				.set({ lastRestAlertTestAt: now })
				.where(
					and(
						eq(users.id, ctx.user.id),
						or(
							isNull(users.lastRestAlertTestAt),
							lt(users.lastRestAlertTestAt, now - TEST_NOTIFICATION_COOLDOWN_MS)
						)
					)
				)
				.returning({ id: users.id })
			if (!claimed) {
				throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Wait before sending another test' })
			}
			try {
				await sendWebPush(subscription, { version: 1, restId: newId('rnj'), url: null }, vapidConfig(ctx.env))
			} catch (error) {
				const status = pushErrorStatus(error)
				if (status === 404 || status === 410) {
					await ctx.db
						.delete(pushSubscriptions)
						.where(
							and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.userId, ctx.user.id))
						)
					// biome-ignore lint/nursery/useErrorCause: TRPCError receives the original cause through its options.
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'Push subscription expired',
						cause: error
					})
				}
				// biome-ignore lint/nursery/useErrorCause: TRPCError receives the original cause through its options.
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Push provider rejected the test',
					cause: error
				})
			}
			console.info('rest_notification_test_accepted', { subscriptionId: subscription.id })
			return { accepted: true }
		})
})

export interface RestNotificationQueueMessage {
	jobId: TypeIDString<'rnj'>
}
