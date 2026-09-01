import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRestAlertSubscriptionId, setRestAlertSubscriptionId, subscribeToRestAlertSubscription } from './restAlerts'

class MemoryStorage implements Storage {
	readonly values = new Map<string, string>()

	get length() {
		return this.values.size
	}

	clear() {
		this.values.clear()
	}

	getItem(key: string) {
		return this.values.get(key) ?? null
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null
	}

	removeItem(key: string) {
		this.values.delete(key)
	}

	setItem(key: string, value: string) {
		this.values.set(key, value)
	}
}

const storage = new MemoryStorage()

beforeEach(() => {
	storage.clear()
	vi.stubGlobal('localStorage', storage)
	setRestAlertSubscriptionId(null)
})

afterEach(() => {
	setRestAlertSubscriptionId(null)
	vi.unstubAllGlobals()
})

describe('rest alert subscription state', () => {
	it('persists valid IDs, notifies subscribers, and removes the value when disabled', () => {
		const listener = vi.fn()
		const unsubscribe = subscribeToRestAlertSubscription(listener)

		setRestAlertSubscriptionId('psb_subscription')
		expect(getRestAlertSubscriptionId()).toBe('psb_subscription')
		expect(storage.getItem('rest-alert-subscription-id')).toBe('psb_subscription')
		expect(listener).toHaveBeenCalledOnce()

		unsubscribe()
		setRestAlertSubscriptionId(null)
		expect(getRestAlertSubscriptionId()).toBeNull()
		expect(storage.getItem('rest-alert-subscription-id')).toBeNull()
		expect(listener).toHaveBeenCalledOnce()
	})

	it('rejects malformed IDs loaded from storage', () => {
		storage.setItem('rest-alert-subscription-id', 'not-a-subscription')
		expect(getRestAlertSubscriptionId()).toBeNull()
	})
})
