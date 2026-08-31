export interface PushSubscriptionLike {
	endpoint: string
	toJSON: () => PushSubscriptionJSON
}

export function vapidPublicKeyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
	const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
	const raw = atob(base64)
	const bytes = new Uint8Array(new ArrayBuffer(raw.length))
	for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
	return bytes
}

export function serializePushSubscription(subscription: PushSubscriptionLike) {
	const json = subscription.toJSON()
	const p256dh = json.keys?.p256dh
	const auth = json.keys?.auth
	if (!(subscription.endpoint && p256dh && auth)) throw new Error('Browser returned an incomplete push subscription')
	return { endpoint: subscription.endpoint, keys: { p256dh, auth } }
}

export async function getOrCreatePushSubscription(
	pushManager: PushManager,
	publicKey: string
): Promise<PushSubscription> {
	const existing = await pushManager.getSubscription()
	if (existing) return existing
	return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKeyBytes(publicKey) })
}

export function supportsRestAlerts(): boolean {
	return (
		typeof window !== 'undefined' &&
		'Notification' in window &&
		'serviceWorker' in navigator &&
		'PushManager' in window
	)
}
