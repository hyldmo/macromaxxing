import { describe, expect, it, vi } from 'vitest'
import type { RestNotificationDeliveryJob, RestNotificationRepository } from './process'
import { processRestNotification } from './process'

const job: RestNotificationDeliveryJob = {
	id: 'rnj_rest',
	sessionId: 'wks_session',
	subscriptionId: 'psb_subscription',
	expiresAt: 20_000,
	status: 'scheduled',
	subscription: { endpoint: 'https://push.example.test', p256dh: 'key', auth: 'auth' }
}

const vapid = { publicKey: 'public', privateKey: 'private' }

function repository(found: RestNotificationDeliveryJob | null = job): RestNotificationRepository {
	return {
		find: vi.fn().mockResolvedValue(found),
		claim: vi.fn().mockResolvedValue(true),
		expire: vi.fn().mockResolvedValue(undefined),
		markSent: vi.fn().mockResolvedValue(undefined),
		markFailed: vi.fn().mockResolvedValue(undefined),
		deleteSubscription: vi.fn().mockResolvedValue(undefined)
	}
}

describe('processRestNotification', () => {
	it('ignores missing, cancelled, and already-claimed jobs', async () => {
		const send = vi.fn()
		expect(await processRestNotification(job.id, 10_000, repository(null), send, vapid)).toBe('ignored')
		expect(
			await processRestNotification(job.id, 10_000, repository({ ...job, status: 'cancelled' }), send, vapid)
		).toBe('ignored')

		const claimedElsewhere = repository()
		vi.mocked(claimedElsewhere.claim).mockResolvedValue(false)
		expect(await processRestNotification(job.id, 10_000, claimedElsewhere, send, vapid)).toBe('ignored')
		expect(send).not.toHaveBeenCalled()
	})

	it('expires a stale scheduled job without sending', async () => {
		const repo = repository()
		const send = vi.fn()
		expect(await processRestNotification(job.id, 20_000, repo, send, vapid)).toBe('expired')
		expect(repo.expire).toHaveBeenCalledWith(job.id, 20_000)
		expect(repo.claim).not.toHaveBeenCalled()
		expect(send).not.toHaveBeenCalled()
	})

	it('atomically claims and sends a fixed generic payload', async () => {
		const repo = repository()
		const send = vi.fn().mockResolvedValue(undefined)
		expect(await processRestNotification(job.id, 10_000, repo, send, vapid)).toBe('sent')
		expect(repo.claim).toHaveBeenCalledWith(job.id, 10_000)
		expect(send).toHaveBeenCalledWith(
			job.subscription,
			{ version: 1, restId: job.id, url: '/workouts/sessions/wks_session/timer' },
			vapid
		)
		expect(repo.markSent).toHaveBeenCalledWith(job.id, expect.any(Number))
	})

	it('deletes dead subscriptions and marks other provider failures', async () => {
		const deadRepo = repository()
		const deadSend = vi.fn().mockRejectedValue({ statusCode: 410 })
		expect(await processRestNotification(job.id, 10_000, deadRepo, deadSend, vapid)).toBe('failed')
		expect(deadRepo.deleteSubscription).toHaveBeenCalledWith(job.subscriptionId)
		expect(deadRepo.markFailed).not.toHaveBeenCalled()

		const failedRepo = repository()
		const failedSend = vi.fn().mockRejectedValue(new Error('provider unavailable'))
		expect(await processRestNotification(job.id, 10_000, failedRepo, failedSend, vapid)).toBe('failed')
		expect(failedRepo.markFailed).toHaveBeenCalledWith(job.id, expect.any(Number))
		expect(failedRepo.deleteSubscription).not.toHaveBeenCalled()
	})
})
