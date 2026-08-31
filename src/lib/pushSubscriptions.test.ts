import { describe, expect, it } from 'vitest'
import { serializePushSubscription, vapidPublicKeyBytes } from './pushSubscriptions'

describe('push subscription helpers', () => {
	it('decodes URL-safe VAPID public keys', () => {
		expect([...vapidPublicKeyBytes('AQID-_8')]).toEqual([1, 2, 3, 251, 255])
	})

	it('serializes only the endpoint and encryption keys', () => {
		expect(
			serializePushSubscription({
				endpoint: 'https://push.example/subscription',
				toJSON: () => ({ endpoint: 'ignored', keys: { p256dh: 'public-key', auth: 'auth-secret' } })
			})
		).toEqual({
			endpoint: 'https://push.example/subscription',
			keys: { p256dh: 'public-key', auth: 'auth-secret' }
		})
	})

	it('rejects subscriptions without encryption keys', () => {
		expect(() =>
			serializePushSubscription({
				endpoint: 'https://push.example/subscription',
				toJSON: () => ({})
			})
		).toThrow('incomplete push subscription')
	})
})
