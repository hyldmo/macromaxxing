import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type RouteCacheStorage, takeParkedRoute } from './usePushRouting'

const TIMER_URL = '/workouts/sessions/wks_session/timer'

function cacheHolding(entry: unknown): { storage: RouteCacheStorage; remove: ReturnType<typeof vi.fn> } {
	const remove = vi.fn().mockResolvedValue(true)
	const storage = {
		open: vi.fn().mockResolvedValue({
			match: vi.fn().mockResolvedValue(entry === undefined ? undefined : { json: () => Promise.resolve(entry) }),
			delete: remove
		})
	}
	return { storage, remove }
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(1_000_000)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('takeParkedRoute', () => {
	it('hands back a fresh route once and spends it', async () => {
		const { storage, remove } = cacheHolding({ url: TIMER_URL, ts: 1_000_000 - 30_000 })

		expect(await takeParkedRoute(storage)).toBe(TIMER_URL)
		expect(remove).toHaveBeenCalledWith('/__push-route')
	})

	it('drops a route the user left sitting, so the app does not jump much later', async () => {
		const { storage } = cacheHolding({ url: TIMER_URL, ts: 1_000_000 - 120_001 })

		expect(await takeParkedRoute(storage)).toBeNull()
	})

	it('refuses anything that is not an in-app path', async () => {
		expect(
			await takeParkedRoute(cacheHolding({ url: 'https://evil.example.test', ts: 1_000_000 }).storage)
		).toBeNull()
		expect(await takeParkedRoute(cacheHolding({ url: TIMER_URL }).storage)).toBeNull()
		expect(await takeParkedRoute(cacheHolding(null).storage)).toBeNull()
	})

	it('stays quiet when nothing is parked and when there is no cache at all', async () => {
		expect(await takeParkedRoute(cacheHolding(undefined).storage)).toBeNull()
		expect(await takeParkedRoute(undefined)).toBeNull()
	})
})
