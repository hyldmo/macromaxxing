import * as webPush from 'web-push'

const VAPID_SUBJECT = 'mailto:support@macromaxxing.com'
const PUSH_TTL_SECONDS = 30

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

export class PushProviderError extends Error {
	readonly statusCode: number

	constructor(statusCode: number, detail: string) {
		super(`Push provider responded ${statusCode}: ${detail}`)
		this.name = 'PushProviderError'
		this.statusCode = statusCode
	}
}

export function pushErrorStatus(error: unknown): number | null {
	if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null
	return typeof error.statusCode === 'number' ? error.statusCode : null
}

/**
 * web-push puts requests on the wire with node:https, which workerd answers with
 * "[unenv] https.request is not implemented yet". Its crypto runs fine there, so
 * generateRequestDetails builds the encrypted body and VAPID headers and fetch sends them.
 */
export async function sendWebPush(
	subscription: StoredPushSubscription,
	payload: RestPushPayload,
	vapid: VapidConfig
): Promise<void> {
	webPush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey)
	const request = webPush.generateRequestDetails(
		{
			endpoint: subscription.endpoint,
			keys: { p256dh: subscription.p256dh, auth: subscription.auth }
		},
		JSON.stringify(payload),
		{ TTL: PUSH_TTL_SECONDS, urgency: 'high' }
	)
	const headers = new Headers()
	for (const [name, value] of Object.entries(request.headers)) {
		// fetch owns Content-Length; the Headers spec forbids setting it here.
		if (name.toLowerCase() !== 'content-length') headers.set(name, value)
	}
	// Buffer carries a node ArrayBufferLike that workerd's BodyInit does not accept; copy into a plain view.
	const body = new Uint8Array(request.body)
	const response = await fetch(request.endpoint, { method: request.method, headers, body })
	if (!response.ok) {
		throw new PushProviderError(response.status, (await response.text()).slice(0, 200))
	}
}
