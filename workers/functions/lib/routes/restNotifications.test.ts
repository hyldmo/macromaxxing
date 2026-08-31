import type { TypeIDString } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../router'

const session: { id: TypeIDString<'wks'>; userId: string; completedAt: number | null } = {
	id: 'wks_session',
	userId: 'user_1',
	completedAt: null
}
const subscription: { id: TypeIDString<'psb'>; userId: string } = {
	id: 'psb_subscription',
	userId: 'user_1'
}
const input = {
	restId: 'rnj_rest' as TypeIDString<'rnj'>,
	sessionId: session.id,
	subscriptionId: subscription.id,
	remainingMs: 60_000
}

function createCaller(options?: {
	session?: typeof session | null
	subscription?: typeof subscription | null
	job?: Record<string, unknown> | null
	queueError?: Error
}) {
	const state = { job: options?.job ?? null }
	const queueSend = options?.queueError
		? vi.fn().mockRejectedValue(options.queueError)
		: vi.fn().mockResolvedValue(undefined)
	const insertedValues: Array<Record<string, unknown>> = []
	const updates: Array<Record<string, unknown>> = []
	const db = {
		query: {
			workoutSessions: { findFirst: vi.fn().mockResolvedValue(options?.session ?? session) },
			pushSubscriptions: { findFirst: vi.fn().mockResolvedValue(options?.subscription ?? subscription) },
			restNotificationJobs: { findFirst: vi.fn(() => Promise.resolve(state.job)) }
		},
		insert: vi.fn(() => ({
			values: vi.fn((values: Record<string, unknown>) => ({
				onConflictDoNothing: vi.fn(() => ({
					returning: vi.fn(() => {
						if (state.job) return Promise.resolve([])
						state.job = values
						insertedValues.push(values)
						return Promise.resolve([{ id: values.id }])
					})
				}))
			}))
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => ({
				where: vi.fn(() => {
					updates.push(values)
					if (state.job?.status === 'scheduled') state.job = { ...state.job, ...values }
					return Promise.resolve([])
				})
			}))
		}))
	}
	const caller = appRouter.createCaller({
		db: db as never,
		user: { id: 'user_1' } as never,
		env: { REST_NOTIFICATION_QUEUE: { send: queueSend } } as never
	})
	return { caller, insertedValues, queueSend, state, updates }
}

describe('restNotifications scheduling policy', () => {
	it('accepts one active-session job and treats an already queued retry as idempotent', async () => {
		const first = createCaller()
		await expect(first.caller.restNotifications.scheduleRest(input)).resolves.toEqual({ accepted: true })
		expect(first.insertedValues[0]).toMatchObject({
			id: input.restId,
			userId: 'user_1',
			status: 'scheduled'
		})
		expect(first.queueSend).toHaveBeenCalledOnce()
		expect(first.updates).toContainEqual(expect.objectContaining({ queuedAt: expect.any(Number) }))

		const retry = createCaller({ job: first.state.job })
		await expect(retry.caller.restNotifications.scheduleRest(input)).resolves.toEqual({ accepted: true })
		expect(retry.queueSend).not.toHaveBeenCalled()
	})

	it('rejects scheduling against a completed session', async () => {
		const { caller, queueSend } = createCaller({ session: { ...session, completedAt: 1 } })
		await expect(caller.restNotifications.scheduleRest(input)).rejects.toEqual(
			new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
		)
		expect(queueSend).not.toHaveBeenCalled()
	})

	it('marks the job failed when Queue rejects so the client can fall back locally', async () => {
		const { caller, state } = createCaller({ queueError: new Error('queue unavailable') })
		await expect(caller.restNotifications.scheduleRest(input)).rejects.toMatchObject({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Could not schedule rest alert'
		})
		expect(state.job).toMatchObject({ status: 'failed' })
	})

	it('persists a cancellation tombstone before scheduling can win the same rest ID', async () => {
		const { caller, insertedValues, queueSend } = createCaller()
		await expect(
			caller.restNotifications.cancelRest({
				restId: input.restId,
				sessionId: input.sessionId,
				subscriptionId: input.subscriptionId
			})
		).resolves.toEqual({ ok: true })
		expect(insertedValues[0]).toMatchObject({ id: input.restId, status: 'cancelled' })

		await expect(caller.restNotifications.scheduleRest(input)).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'Rest notification is no longer active'
		})
		expect(queueSend).not.toHaveBeenCalled()
	})

	it('rejects a rest identity collision without exposing another user job', async () => {
		const foreignJob = {
			id: input.restId,
			userId: 'user_2',
			sessionId: input.sessionId,
			subscriptionId: input.subscriptionId,
			status: 'scheduled',
			queuedAt: null,
			dueAt: Date.now() + 60_000,
			expiresAt: Date.now() + 120_000
		}
		const { caller } = createCaller({ job: foreignJob })
		await expect(caller.restNotifications.scheduleRest(input)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'Rest notification not found'
		})
	})
})
