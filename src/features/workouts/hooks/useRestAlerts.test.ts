import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRestAlertDelivery } from './useRestAlerts'

const rest = {
	id: 'rnj_rest',
	startedAt: 1_000,
	endAt: 61_000,
	total: 60,
	setType: 'working'
} as const

function dependencies(online: boolean) {
	return {
		isOnline: vi.fn(() => online),
		isCurrentRest: vi.fn(() => true),
		scheduleLocal: vi.fn(),
		clearLocal: vi.fn(),
		scheduleServer: vi.fn().mockResolvedValue({ accepted: true }),
		cancelServer: vi.fn()
	}
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(1_000)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('startRestAlertDelivery', () => {
	it('uses page-local delivery when the rest starts offline', () => {
		const deps = dependencies(false)
		startRestAlertDelivery({ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' }, deps)
		vi.runAllTimers()

		expect(deps.scheduleLocal).toHaveBeenCalledWith(rest, 'wks_session')
		expect(deps.scheduleServer).not.toHaveBeenCalled()
	})

	it('uses server delivery online without arming a local duplicate', async () => {
		const deps = dependencies(true)
		const cleanup = startRestAlertDelivery(
			{ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' },
			deps
		)
		vi.runAllTimers()
		await Promise.resolve()

		expect(deps.scheduleServer).toHaveBeenCalledWith({
			restId: 'rnj_rest',
			sessionId: 'wks_session',
			subscriptionId: 'psb_subscription',
			remainingMs: 60_000
		})
		expect(deps.scheduleLocal).not.toHaveBeenCalled()

		cleanup()
		await Promise.resolve()
		expect(deps.cancelServer).toHaveBeenCalledWith({
			restId: 'rnj_rest',
			sessionId: 'wks_session',
			subscriptionId: 'psb_subscription'
		})
	})

	it('falls back locally when online scheduling fails before acceptance', async () => {
		const deps = dependencies(true)
		deps.scheduleServer.mockRejectedValue(new Error('offline'))
		startRestAlertDelivery({ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' }, deps)
		vi.runAllTimers()
		await Promise.resolve()
		await Promise.resolve()

		expect(deps.scheduleLocal).toHaveBeenCalledWith(rest, 'wks_session')
	})

	it('does not fall back after the rest expires or is replaced', async () => {
		const expiredDeps = dependencies(true)
		expiredDeps.scheduleServer.mockRejectedValue(new Error('offline'))
		startRestAlertDelivery({ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' }, expiredDeps)
		vi.runAllTimers()
		vi.setSystemTime(rest.endAt)
		await Promise.resolve()
		await Promise.resolve()
		expect(expiredDeps.scheduleLocal).not.toHaveBeenCalled()

		vi.setSystemTime(1_000)
		const replacedDeps = dependencies(true)
		replacedDeps.isCurrentRest.mockReturnValue(false)
		replacedDeps.scheduleServer.mockRejectedValue(new Error('offline'))
		startRestAlertDelivery({ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' }, replacedDeps)
		vi.runAllTimers()
		await Promise.resolve()
		await Promise.resolve()
		expect(replacedDeps.scheduleLocal).not.toHaveBeenCalled()
	})

	it('cancels a rejected in-flight server request without arming a local alert after cleanup', async () => {
		const deps = dependencies(true)
		let rejectRequest: (error: Error) => void = () => undefined
		deps.scheduleServer.mockReturnValue(
			new Promise((_resolve, reject) => {
				rejectRequest = reject
			})
		)
		const cleanup = startRestAlertDelivery(
			{ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' },
			deps
		)
		vi.runAllTimers()
		cleanup()
		rejectRequest(new Error('offline'))
		await Promise.resolve()
		await Promise.resolve()

		expect(deps.scheduleLocal).not.toHaveBeenCalled()
		expect(deps.cancelServer).toHaveBeenCalledWith({
			restId: rest.id,
			sessionId: 'wks_session',
			subscriptionId: 'psb_subscription'
		})
	})

	it('does no work when Strict Mode cleans up the deferred first pass', () => {
		const deps = dependencies(true)
		const cleanup = startRestAlertDelivery(
			{ rest, sessionId: 'wks_session', subscriptionId: 'psb_subscription' },
			deps
		)
		cleanup()
		vi.runAllTimers()

		expect(deps.scheduleServer).not.toHaveBeenCalled()
		expect(deps.scheduleLocal).not.toHaveBeenCalled()
		expect(deps.cancelServer).not.toHaveBeenCalled()
	})
})
