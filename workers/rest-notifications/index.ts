import { pushSubscriptions, restNotificationJobs, zodTypeID } from '@macromaxxing/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createDb, type Database } from '../functions/lib/db'
import { sendWebPush } from '../functions/lib/web-push'
import { processRestNotification, type RestNotificationRepository } from './process'

const queueMessage = z.object({ jobId: zodTypeID('rnj') })

function createRepository(db: Database): RestNotificationRepository {
	return {
		find: async jobId => {
			const job = await db.query.restNotificationJobs.findFirst({
				where: { id: jobId },
				with: { subscription: true }
			})
			return job ?? null
		},
		claim: async (jobId, now) => {
			const [claimed] = await db
				.update(restNotificationJobs)
				.set({ status: 'sending', updatedAt: now })
				.where(and(eq(restNotificationJobs.id, jobId), eq(restNotificationJobs.status, 'scheduled')))
				.returning({ id: restNotificationJobs.id })
			return claimed !== undefined
		},
		expire: async (jobId, now) => {
			await db
				.update(restNotificationJobs)
				.set({ status: 'expired', updatedAt: now })
				.where(and(eq(restNotificationJobs.id, jobId), eq(restNotificationJobs.status, 'scheduled')))
		},
		markSent: async (jobId, now) => {
			await db
				.update(restNotificationJobs)
				.set({ status: 'sent', updatedAt: now })
				.where(and(eq(restNotificationJobs.id, jobId), eq(restNotificationJobs.status, 'sending')))
		},
		markFailed: async (jobId, now) => {
			await db
				.update(restNotificationJobs)
				.set({ status: 'failed', updatedAt: now })
				.where(and(eq(restNotificationJobs.id, jobId), eq(restNotificationJobs.status, 'sending')))
		},
		deleteSubscription: async subscriptionId => {
			await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId))
		}
	}
}

async function processMessage(message: Message<unknown>, env: Cloudflare.Env): Promise<void> {
	try {
		const parsed = queueMessage.safeParse(message.body)
		if (!parsed.success) {
			console.error('rest_notification_invalid_message', { messageId: message.id })
			return
		}
		const result = await processRestNotification(
			parsed.data.jobId,
			Date.now(),
			createRepository(createDb(env.DB)),
			sendWebPush,
			{ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
		)
		console.info('rest_notification_processed', { jobId: parsed.data.jobId, result })
	} catch {
		console.error('rest_notification_processing_failed', { messageId: message.id })
	} finally {
		message.ack()
	}
}

export default {
	async queue(batch: MessageBatch<unknown>, env: Cloudflare.Env): Promise<void> {
		await Promise.all(batch.messages.map(message => processMessage(message, env)))
	}
} satisfies ExportedHandler<Cloudflare.Env>
