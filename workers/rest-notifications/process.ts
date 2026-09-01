import type { RestNotificationStatus, TypeIDString } from '@macromaxxing/db'
import { pushErrorStatus, type RestPushPayload, type VapidConfig } from '../functions/lib/web-push'

export interface RestNotificationDeliveryJob {
	id: TypeIDString<'rnj'>
	userId: string
	sessionId: TypeIDString<'wks'>
	subscriptionId: TypeIDString<'psb'>
	expiresAt: number
	status: RestNotificationStatus
	subscription: {
		userId: string
		endpoint: string
		p256dh: string
		auth: string
	}
}

export interface RestNotificationRepository {
	find: (jobId: TypeIDString<'rnj'>) => Promise<RestNotificationDeliveryJob | null>
	claim: (jobId: TypeIDString<'rnj'>, now: number) => Promise<boolean>
	ownsSubscription: (subscriptionId: TypeIDString<'psb'>, userId: string) => Promise<boolean>
	expire: (jobId: TypeIDString<'rnj'>, now: number) => Promise<void>
	markSent: (jobId: TypeIDString<'rnj'>, now: number) => Promise<void>
	markFailed: (jobId: TypeIDString<'rnj'>, now: number) => Promise<void>
	deleteSubscription: (subscriptionId: TypeIDString<'psb'>, userId: string) => Promise<void>
}

export type RestNotificationSender = (
	subscription: RestNotificationDeliveryJob['subscription'],
	payload: RestPushPayload,
	vapid: VapidConfig
) => Promise<void>

export type RestNotificationProcessingResult = 'ignored' | 'expired' | 'sent' | 'failed'

export async function processRestNotification(
	jobId: TypeIDString<'rnj'>,
	now: number,
	repository: RestNotificationRepository,
	send: RestNotificationSender,
	vapid: VapidConfig
): Promise<RestNotificationProcessingResult> {
	const job = await repository.find(jobId)
	if (!job || job.status !== 'scheduled') return 'ignored'
	if (job.expiresAt <= now) {
		await repository.expire(job.id, now)
		return 'expired'
	}
	if (!(await repository.claim(job.id, now))) return 'ignored'
	if (
		job.subscription.userId !== job.userId ||
		!(await repository.ownsSubscription(job.subscriptionId, job.userId))
	) {
		await repository.markFailed(job.id, now)
		return 'failed'
	}

	try {
		await send(
			job.subscription,
			{
				version: 1,
				restId: job.id,
				url: `/workouts/sessions/${job.sessionId}/timer`
			},
			vapid
		)
		await repository.markSent(job.id, Date.now())
		return 'sent'
	} catch (error) {
		const status = pushErrorStatus(error)
		if (status === 404 || status === 410) {
			await repository.deleteSubscription(job.subscriptionId, job.userId)
		} else await repository.markFailed(job.id, Date.now())
		return 'failed'
	}
}
