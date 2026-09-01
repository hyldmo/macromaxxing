import * as webPush from 'web-push'

const VAPID_SUBJECT = 'mailto:support@macromaxxing.com'

export interface StoredPushSubscription {
	endpoint: string
	p256dh: string
	auth: string
}

export interface RestPushPayload {
	version: 1
	restId: string
	url: string | null
}

export interface VapidConfig {
	publicKey: string
	privateKey: string
}

export function pushErrorStatus(error: unknown): number | null {
	if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null
	return typeof error.statusCode === 'number' ? error.statusCode : null
}

export async function sendWebPush(
	subscription: StoredPushSubscription,
	payload: RestPushPayload,
	vapid: VapidConfig
): Promise<void> {
	webPush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey)
	await webPush.sendNotification(
		{
			endpoint: subscription.endpoint,
			keys: { p256dh: subscription.p256dh, auth: subscription.auth }
		},
		JSON.stringify(payload),
		{ TTL: 30, urgency: 'high' }
	)
}
