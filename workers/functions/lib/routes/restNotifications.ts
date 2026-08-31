import { newId, pushSubscriptions, restNotificationJobs, type TypeIDString, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'
import { pushErrorStatus, sendWebPush } from '../web-push'

const MAX_REST_MS = 15 * 60 * 1000
const PUSH_EXPIRY_GRACE_MS = 30 * 1000

const subscriptionInput = z.object({
	endpoint: z.url().startsWith('https://'),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1)
	})
})

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
						eq(restNotificationJobs.status, 'scheduled')
					)
				)
			await ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
			console.info('push_subscription_unregistered', { subscriptionId: subscription.id })
			return { ok: true }
		}),

	scheduleRest: protectedProcedure
		.input(
			z.object({
				restId: zodTypeID('rnj'),
				sessionId: zodTypeID('wks'),
				subscriptionId: zodTypeID('psb'),
				remainingMs: z.number().int().positive().max(MAX_REST_MS)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const [session, subscription, existing] = await Promise.all([
				ctx.db.query.workoutSessions.findFirst({ where: { id: input.sessionId } }),
				ctx.db.query.pushSubscriptions.findFirst({ where: { id: input.subscriptionId } }),
				ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
			])
			if (!session || session.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
			}
			if (!subscription || subscription.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' })
			}
			if (existing && existing.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification not found' })
			}
			if (
				existing &&
				(existing.sessionId !== input.sessionId || existing.subscriptionId !== input.subscriptionId)
			) {
				throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification identity is already in use' })
			}
			if (existing?.status === 'scheduled' && existing.queuedAt !== null) return { accepted: true }
			if (existing && existing.status !== 'scheduled') {
				throw new TRPCError({ code: 'CONFLICT', message: 'Rest notification is no longer active' })
			}

			const now = Date.now()
			const dueAt = existing?.dueAt ?? now + input.remainingMs
			const expiresAt = existing?.expiresAt ?? dueAt + PUSH_EXPIRY_GRACE_MS
			if (dueAt <= now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rest has already ended' })
			if (!existing) {
				await ctx.db.insert(restNotificationJobs).values({
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
			}

			try {
				await ctx.env.REST_NOTIFICATION_QUEUE.send(
					{ jobId: input.restId },
					{ delaySeconds: Math.max(0, Math.ceil((dueAt - Date.now()) / 1000)) }
				)
			} catch (error) {
				await ctx.db
					.delete(restNotificationJobs)
					.where(and(eq(restNotificationJobs.id, input.restId), isNull(restNotificationJobs.queuedAt)))
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
				.where(and(eq(restNotificationJobs.id, input.restId), eq(restNotificationJobs.status, 'scheduled')))
			console.info('rest_notification_scheduled', {
				jobId: input.restId,
				subscriptionId: input.subscriptionId
			})
			return { accepted: true }
		}),

	cancelRest: protectedProcedure.input(z.object({ restId: zodTypeID('rnj') })).mutation(async ({ ctx, input }) => {
		const job = await ctx.db.query.restNotificationJobs.findFirst({ where: { id: input.restId } })
		if (!job) return { ok: true }
		if (job.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Rest notification not found' })
		}
		await ctx.db
			.update(restNotificationJobs)
			.set({ status: 'cancelled', updatedAt: Date.now() })
			.where(and(eq(restNotificationJobs.id, input.restId), eq(restNotificationJobs.status, 'scheduled')))
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
			try {
				await sendWebPush(subscription, { version: 1, restId: newId('rnj'), url: null }, vapidConfig(ctx.env))
			} catch (error) {
				const status = pushErrorStatus(error)
				if (status === 404 || status === 410) {
					await ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
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
