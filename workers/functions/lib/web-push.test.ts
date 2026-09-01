import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushErrorStatus, sendWebPush } from './web-push'

const vapid = {
	publicKey: 'BFSpl5Heumtmf1MX-MsYTzzy5yL4_JmZE8oVzvZ9VepIdabuPZpEnNs_dawmGxm7UvhRuFeAAjuOoJbYiABemNg',
	privateKey: 'KRtizm2o1dMf7MNvRTFB7Pxv3v6sylCdWiHI3VZ6RkI'
}

const subscription = {
	endpoint: 'https://web.push.apple.com/probe',
	p256dh: 'BOubjizm9rA6fran6aoffrxTNOgz2zZvphPUtzPoI-O0Vy8WtEFYJsI5Nn3e4pXyyjR2mYps3NVZ599qpxm1dT0',
	auth: 'OgZVWrH6aIai1lFTCGjEKg'
}

const payload = { version: 1, restId: 'rnj_test', url: null } as const

function stubFetch(response: Response) {
	const fetchMock = vi.fn().mockResolvedValue(response)
	vi.stubGlobal('fetch', fetchMock)
	return fetchMock
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('pushErrorStatus', () => {
	it('reads provider status codes without assuming every error shape', () => {
		expect(pushErrorStatus({ statusCode: 410 })).toBe(410)
		expect(pushErrorStatus(new Error('offline'))).toBeNull()
		expect(pushErrorStatus(null)).toBeNull()
	})
})

describe('sendWebPush', () => {
	it('delivers over fetch, since workerd has no node:https to send on', async () => {
		const fetchMock = stubFetch(new Response(null, { status: 201 }))

		await sendWebPush(subscription, payload, vapid)

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		const headers = new Headers(init.headers)
		expect(url).toBe(subscription.endpoint)
		expect(init.method).toBe('POST')
		expect(headers.get('Authorization')).toMatch(/^vapid t=/)
		expect(headers.get('Content-Encoding')).toBe('aes128gcm')
		expect(headers.get('TTL')).toBe('30')
		expect(headers.has('Content-Length')).toBe(false)
		expect(init.body.byteLength).toBeGreaterThan(0)
	})

	it('reports a rejected send with the provider status attached', async () => {
		stubFetch(new Response('gone', { status: 410 }))

		const error = await sendWebPush(subscription, payload, vapid).catch((thrown: unknown) => thrown)

		expect(pushErrorStatus(error)).toBe(410)
	})
})
