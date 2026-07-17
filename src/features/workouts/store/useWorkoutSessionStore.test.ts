import type { Exercise } from '@macromaxxing/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SetCursor } from '~/lib'
import { useWorkoutSessionStore } from './useWorkoutSessionStore'

const BENCH: SetCursor = { exerciseId: 'exc_bench' as Exercise['id'], setNumber: 1 }
const BENCH_2: SetCursor = { exerciseId: 'exc_bench' as Exercise['id'], setNumber: 2 }

function store() {
	return useWorkoutSessionStore.getState()
}

beforeEach(() => {
	vi.useFakeTimers()
	// Mock browser APIs
	vi.stubGlobal('window', globalThis)
	vi.stubGlobal('navigator', { vibrate: vi.fn() })
	vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
	// Reset store between tests
	store().reset()
})

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('setSession()', () => {
	it('sets id and startedAt', () => {
		store().setSession({ id: 'wks_1', startedAt: 1000 })
		expect(store().sessionId).toBe('wks_1')
		expect(store().sessionStartedAt).toBe(1000)
	})

	it('same session: keeps cursor, draft, and timers', () => {
		store().setSession({ id: 'wks_1', startedAt: 1000 })
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().startRest(60, 'working')

		store().setSession({ id: 'wks_1' })
		expect(store().cursor).toEqual(BENCH)
		expect(store().draft).toEqual({ weight: 100 })
		expect(store().rest).not.toBeNull()
	})

	it('different session: resets position state and timers', () => {
		store().setSession({ id: 'wks_1', startedAt: 1000 })
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().startRest(60, 'working')

		store().setSession({ id: 'wks_2', startedAt: 2000 })
		expect(store().sessionId).toBe('wks_2')
		expect(store().sessionStartedAt).toBe(2000)
		expect(store().cursor).toBeNull()
		expect(store().draft).toEqual({})
		expect(store().rest).toBeNull()
	})

	it('null: full reset', () => {
		store().setSession({ id: 'wks_1', startedAt: 1000 })
		store().setSession(null)
		expect(store().sessionId).toBeNull()
		expect(store().sessionStartedAt).toBeNull()
	})
})

describe('setCursor()', () => {
	it('moves the cursor and clears set-scoped state', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().startSet(BENCH)

		store().setCursor(BENCH_2)
		expect(store().cursor).toEqual(BENCH_2)
		expect(store().draft).toEqual({})
		expect(store().setTimer).toBeNull()
	})

	it('re-setting the same cursor resets the draft (fresh planned values)', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().setCursor(BENCH)
		expect(store().draft).toEqual({})
	})
})

describe('setDraft()', () => {
	it('merges patches for the current cursor', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().setDraft(BENCH, { reps: 12 })
		expect(store().draft).toEqual({ weight: 100, reps: 12 })
	})

	it('cursor mismatch: snaps to the edited set with a fresh draft, keeps the stopwatch', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().startSet(BENCH)

		store().setDraft(BENCH_2, { reps: 5 })
		expect(store().cursor).toEqual(BENCH_2)
		expect(store().draft).toEqual({ reps: 5 })
		expect(store().setTimer).not.toBeNull()
	})

	it('supports explicit null weight (cleared input)', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: null })
		expect(store().draft).toEqual({ weight: null })
	})
})

describe('set stopwatch', () => {
	it('startSet on the current cursor starts the timer, keeps draft', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		vi.setSystemTime(5000)
		store().startSet(BENCH)
		expect(store().setTimer).toEqual({ startedAt: 5000, pausedAt: null })
		expect(store().draft).toEqual({ weight: 100 })
	})

	it('startSet on another set snaps the cursor and clears its state', () => {
		store().setCursor(BENCH)
		store().setDraft(BENCH, { weight: 100 })
		store().startSet(BENCH_2)
		expect(store().cursor).toEqual(BENCH_2)
		expect(store().draft).toEqual({})
		expect(store().setTimer).not.toBeNull()
	})

	it('pause freezes elapsed; resume excludes the paused span', () => {
		store().setCursor(BENCH)
		vi.setSystemTime(1000)
		store().startSet(BENCH)
		vi.setSystemTime(4000) // 3s of work
		store().pauseSet()
		expect(store().setTimer).toEqual({ startedAt: 1000, pausedAt: 4000 })

		vi.setSystemTime(10000) // 6s paused
		store().resumeSet()
		// startedAt shifted by the 6s pause → elapsed stays 3s
		expect(store().setTimer).toEqual({ startedAt: 7000, pausedAt: null })
	})

	it('pause/resume are no-ops without a matching timer state', () => {
		store().pauseSet()
		expect(store().setTimer).toBeNull()
		store().resumeSet()
		expect(store().setTimer).toBeNull()

		store().startSet(BENCH)
		const running = store().setTimer
		store().resumeSet() // not paused
		expect(store().setTimer).toBe(running)
	})

	it('stopSet clears the timer', () => {
		store().startSet(BENCH)
		store().stopSet()
		expect(store().setTimer).toBeNull()
	})
})

describe('startRest()', () => {
	it('no roundStartedAt → rest starts now', () => {
		vi.setSystemTime(5000)
		store().startRest(60, 'working')

		expect(store().rest).toEqual({
			startedAt: 5000,
			endAt: 5000 + 60 * 1000,
			total: 60,
			setType: 'working'
		})
	})

	it('set time is NOT subtracted from rest', () => {
		vi.setSystemTime(1000)
		store().startSet(BENCH)
		vi.setSystemTime(31000) // 30 seconds doing the set
		vi.setSystemTime(32000)
		store().startRest(60, 'working')

		expect(store().rest!.total).toBe(60)
		expect(store().rest!.endAt).toBe(32000 + 60 * 1000)
	})

	it('roundStartedAt set → subtracts elapsed transition time, backdates startedAt', () => {
		vi.setSystemTime(1000)
		store().recordTransition()
		vi.setSystemTime(11000) // 10 seconds later

		store().startRest(60, 'working')
		// total stays at full duration; endAt reflects the 10s already elapsed during the round
		expect(store().rest!.total).toBe(60)
		expect(store().rest!.endAt).toBe(11000 + 50 * 1000)
		// startedAt backdated to when the round began so (total - remaining) shows time already rested
		expect(store().rest!.startedAt).toBe(1000)
		expect(store().roundStartedAt).toBeNull() // cleared after use
	})

	it('recordTransition keeps the earliest round start', () => {
		vi.setSystemTime(1000)
		store().recordTransition()
		vi.setSystemTime(5000)
		store().recordTransition()
		expect(store().roundStartedAt).toBe(1000)
	})
})

describe('dismissRest()', () => {
	it('clears rest and round tracking, leaves the cursor alone', () => {
		store().setCursor(BENCH)
		store().recordTransition()
		store().startRest(60, 'working')

		store().dismissRest()
		expect(store().rest).toBeNull()
		expect(store().roundStartedAt).toBeNull()
		expect(store().cursor).toEqual(BENCH)
	})
})

describe('reset()', () => {
	it('clears all state', () => {
		store().setSession({ id: 'wks_1', startedAt: 1000 })
		store().setCursor(BENCH)
		store().startSet(BENCH)
		store().startRest(60, 'working')

		store().reset()

		expect(store().sessionId).toBeNull()
		expect(store().sessionStartedAt).toBeNull()
		expect(store().cursor).toBeNull()
		expect(store().draft).toEqual({})
		expect(store().setTimer).toBeNull()
		expect(store().rest).toBeNull()
		expect(store().roundStartedAt).toBeNull()
	})
})
