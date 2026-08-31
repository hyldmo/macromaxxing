import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	getOrCreatePushSubscription,
	serializePushSubscription,
	supportsRestAlerts,
	vapidPublicKeyBytes
} from './pushSubscriptions'

function pushSubscription(endpoint: string): PushSubscription {
	return {
		endpoint,
		expirationTime: null,
		options: { applicationServerKey: null, userVisibleOnly: true },
		getKey: () => null,
		toJSON: () => ({ endpoint }),
		unsubscribe: async () => true
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

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

	it('reuses an existing browser subscription instead of creating a duplicate', async () => {
		const existing = pushSubscription('https://push.example/existing')
		const pushManager: PushManager = {
			getSubscription: vi.fn().mockResolvedValue(existing),
			permissionState: vi.fn().mockResolvedValue('granted'),
			subscribe: vi.fn()
		}

		expect(await getOrCreatePushSubscription(pushManager, 'AQID')).toBe(existing)
		expect(pushManager.subscribe).not.toHaveBeenCalled()
	})

	it('creates a user-visible subscription with the decoded VAPID key when none exists', async () => {
		const created = pushSubscription('https://push.example/new')
		const pushManager: PushManager = {
			getSubscription: vi.fn().mockResolvedValue(null),
			permissionState: vi.fn().mockResolvedValue('granted'),
			subscribe: vi.fn().mockResolvedValue(created)
		}

		expect(await getOrCreatePushSubscription(pushManager, 'AQID')).toBe(created)
		expect(pushManager.subscribe).toHaveBeenCalledWith({
			userVisibleOnly: true,
			applicationServerKey: new Uint8Array([1, 2, 3])
		})
	})

	it('reports support only when every required browser API exists', () => {
		vi.stubGlobal('window', { Notification: class {}, PushManager: class {} })
		vi.stubGlobal('navigator', { serviceWorker: {} })
		expect(supportsRestAlerts()).toBe(true)

		vi.stubGlobal('navigator', {})
		expect(supportsRestAlerts()).toBe(false)
	})
})
