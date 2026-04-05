import type { Exercise } from '@macromaxxing/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlatSet } from '~/lib'
import { useWorkoutSessionStore } from './useWorkoutSessionStore'

// --- Helpers ---

function makeSet(overrides: Partial<FlatSet> = {}): FlatSet {
	return {
		exerciseId: 'exc_bench' as Exercise['id'],
		exerciseName: 'Bench Press',
		setType: 'working',
		weightKg: 80,
		reps: 8,
		setNumber: 1,
		totalSets: 3,
		transition: false,
		itemIndex: 0,
		completed: false,
		superset: null,
		...overrides
	}
}

function makeSupersetPair(opts: { group: number; itemIndex: number }): FlatSet[] {
	const exercises = [
		{ exerciseId: 'exc_a' as Exercise['id'], name: 'Exercise A', letter: 'A' },
		{ exerciseId: 'exc_b' as Exercise['id'], name: 'Exercise B', letter: 'B' }
	]
	const ssInfo = {
		group: opts.group,
		exerciseLetter: 'A',
		exercises: exercises.map(e => ({ exerciseId: e.exerciseId, name: e.name, letter: e.letter }))
	}

	return [
		makeSet({
			exerciseId: exercises[0].exerciseId,
			exerciseName: exercises[0].name,
			setType: 'working',
			transition: true,
			itemIndex: opts.itemIndex,
			superset: ssInfo,
			setNumber: 1,
			totalSets: 1
		}),
		makeSet({
			exerciseId: exercises[1].exerciseId,
			exerciseName: exercises[1].name,
			setType: 'working',
			transition: false,
			itemIndex: opts.itemIndex,
			superset: ssInfo,
			setNumber: 1,
			totalSets: 1
		})
	]
}

function store() {
	return useWorkoutSessionStore.getState()
}

// --- Setup ---

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

// --- Tests ---

describe('init()', () => {
	it('T1: empty sets → active = null', () => {
		store().init('wks_1', 1000, [])
		expect(store().active).toBeNull()
		expect(store().queue).toEqual([])
	})

	it('T2: some completed → cursor skips to first pending', () => {
		const sets = [
			makeSet({ completed: true, setNumber: 1 }),
			makeSet({ completed: true, setNumber: 2 }),
			makeSet({ completed: false, setNumber: 3 })
		]
		store().init('wks_1', 1000, sets)
		expect(store().active?.index).toBe(2)
	})

	it('T3: all pending → cursor = 0', () => {
		const sets = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		store().init('wks_1', 1000, sets)
		expect(store().active?.index).toBe(0)
		expect(store().active?.weight).toBe(80)
		expect(store().active?.reps).toBe(8)
	})
})

describe('confirmSet()', () => {
	it('T4: active is null → returns null', () => {
		store().init('wks_1', 1000, [])
		const result = store().confirmSet()
		expect(result).toBeNull()
	})

	it('T5: solo exercise → mark confirmed, keep cursor on confirmed set', () => {
		const sets = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		store().init('wks_1', 1000, sets)

		const data = store().confirmSet()

		expect(data).toEqual({
			exerciseId: 'exc_bench',
			weightKg: 80,
			reps: 8,
			setType: 'working',
			transition: false
		})
		// Cursor stays on confirmed set (not advanced — rest hasn't been dismissed)
		expect(store().active?.index).toBe(0)
		expect(store().confirmedIndices).toEqual([0])
	})

	it('T6: superset mid-round (transition) → set _roundStartedAt, advance cursor, no rest', () => {
		const sets = makeSupersetPair({ group: 1, itemIndex: 0 })
		store().init('wks_1', 1000, sets)

		vi.setSystemTime(5000)
		const data = store().confirmSet()

		expect(data?.transition).toBe(true)
		// Cursor advances to B1
		expect(store().active?.index).toBe(1)
		expect(store()._roundStartedAt).toBe(5000)
		// Auto-starts next set timer
		expect(store().active?.setTimer).not.toBeNull()
		// No rest started
		expect(store().rest).toBeNull()
	})

	it('T7: superset last-in-round → keeps cursor, no auto-advance', () => {
		const sets = makeSupersetPair({ group: 1, itemIndex: 0 })
		store().init('wks_1', 1000, sets)

		// Confirm A1 (transition)
		vi.setSystemTime(5000)
		store().confirmSet()

		// Confirm B1 (last in round)
		vi.setSystemTime(10000)
		const data = store().confirmSet()

		expect(data?.transition).toBe(false)
		// Cursor stays on B1 (confirmed, waiting for rest to be dismissed)
		expect(store().active?.index).toBe(1)
		expect(store().confirmedIndices).toEqual([0, 1])
	})

	it('T8: returns correct mutation data', () => {
		const sets = [makeSet({ weightKg: 100, reps: 5, setType: 'warmup' })]
		store().init('wks_1', 1000, sets)
		store().editWeight(105)
		store().editReps(6)

		const data = store().confirmSet()
		expect(data).toEqual({
			exerciseId: 'exc_bench',
			weightKg: 105,
			reps: 6,
			setType: 'warmup',
			transition: false
		})
	})
})

describe('dismissRest()', () => {
	it('T9: rest is null → still advances cursor if possible', () => {
		const sets = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		store().init('wks_1', 1000, sets)
		store().confirmSet()
		// No rest started, but dismissRest should still advance
		store().dismissRest()
		expect(store().active?.index).toBe(1)
	})

	it('T10: has next pending → advance cursor, load planned values', () => {
		const sets = [makeSet({ setNumber: 1, weightKg: 80 }), makeSet({ setNumber: 2, weightKg: 85 })]
		store().init('wks_1', 1000, sets)
		store().confirmSet()
		store().dismissRest()

		expect(store().active?.index).toBe(1)
		expect(store().active?.weight).toBe(85)
		expect(store().rest).toBeNull()
	})

	it('T11: no more pending → active = null', () => {
		const sets = [makeSet({ setNumber: 1 })]
		store().init('wks_1', 1000, sets)
		store().confirmSet()
		store().dismissRest()

		expect(store().active).toBeNull()
	})
})

describe('startRest() [checklist mode]', () => {
	it('T12: no _roundStartedAt → rest starts now', () => {
		store().init('wks_1', 1000, [makeSet()])
		vi.setSystemTime(5000)
		store().startRest(60, 'working')

		expect(store().rest).not.toBeNull()
		expect(store().rest!.total).toBe(60)
		expect(store().rest!.setType).toBe('working')
		expect(store().rest!.endAt).toBe(5000 + 60 * 1000)
	})

	it('T13: has _roundStartedAt → subtracts elapsed time', () => {
		store().init('wks_1', 1000, [makeSet()])
		vi.setSystemTime(1000)
		store().recordTransition()
		vi.setSystemTime(11000) // 10 seconds later

		store().startRest(60, 'working')
		// 60 - 10 = 50 seconds adjusted
		expect(store().rest!.total).toBe(50)
		expect(store()._roundStartedAt).toBeNull() // cleared after use
	})
})

describe('undo()', () => {
	it('T14: no confirmed sets → no-op', () => {
		store().init('wks_1', 1000, [makeSet()])
		const before = store().active?.index
		store().undo()
		expect(store().active?.index).toBe(before)
	})

	it('T15: has confirmed → pop last, restore cursor, clear rest', () => {
		const sets = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		store().init('wks_1', 1000, sets)
		store().confirmSet()

		store().undo()
		expect(store().confirmedIndices).toEqual([])
		expect(store().active?.index).toBe(0)
		expect(store().rest).toBeNull()
	})
})

describe('editWeight / editReps', () => {
	it('T16: updates active.weight and active.reps', () => {
		store().init('wks_1', 1000, [makeSet()])
		store().editWeight(100)
		expect(store().active?.weight).toBe(100)

		store().editReps(12)
		expect(store().active?.reps).toBe(12)
	})
})

describe('setLogId', () => {
	it('T17: sets active.logId', () => {
		store().init('wks_1', 1000, [makeSet()])
		store().setLogId('wkl_abc')
		expect(store().active?.logId).toBe('wkl_abc')
	})
})

describe('set timer control', () => {
	it('T18: startSet → sets setTimer.startedAt', () => {
		store().init('wks_1', 1000, [makeSet()])
		vi.setSystemTime(5000)
		store().startSet()
		expect(store().active?.setTimer?.startedAt).toBe(5000)
		expect(store().active?.setTimer?.isPaused).toBe(false)
	})

	it('T19: pauseSet → sets isPaused', () => {
		store().init('wks_1', 1000, [makeSet()])
		store().startSet()
		store().pauseSet()
		expect(store().active?.setTimer?.isPaused).toBe(true)
	})

	it('T20: resumeSet → adjusts startedAt by elapsed', () => {
		store().init('wks_1', 1000, [makeSet()])
		vi.setSystemTime(1000)
		store().startSet()
		vi.setSystemTime(4000) // 3 seconds elapsed
		store().pauseSet()

		vi.setSystemTime(10000)
		store().resumeSet(3000)
		// startedAt = now - elapsedMs = 10000 - 3000 = 7000
		expect(store().active?.setTimer?.startedAt).toBe(7000)
		expect(store().active?.setTimer?.isPaused).toBe(false)
	})

	it('T21: stopSet → clears setTimer', () => {
		store().init('wks_1', 1000, [makeSet()])
		store().startSet()
		store().stopSet()
		expect(store().active?.setTimer).toBeNull()
	})
})

describe('navigate', () => {
	it('T22: direction=1 → next exercise group', () => {
		const sets = [
			makeSet({ exerciseId: 'exc_a' as Exercise['id'], itemIndex: 0, setNumber: 1 }),
			makeSet({ exerciseId: 'exc_b' as Exercise['id'], itemIndex: 1, setNumber: 1 })
		]
		store().init('wks_1', 1000, sets)
		expect(store().active?.index).toBe(0)

		store().navigate(1)
		expect(store().active?.index).toBe(1)
	})

	it('T23: direction=-1 → prev exercise group', () => {
		const sets = [
			makeSet({ exerciseId: 'exc_a' as Exercise['id'], itemIndex: 0, setNumber: 1 }),
			makeSet({ exerciseId: 'exc_b' as Exercise['id'], itemIndex: 1, setNumber: 1 })
		]
		store().init('wks_1', 1000, sets)
		store().navigate(1) // go to index 1
		store().navigate(-1) // back to index 0
		expect(store().active?.index).toBe(0)
	})

	it('T24: no target → no-op', () => {
		const sets = [makeSet({ itemIndex: 0 })]
		store().init('wks_1', 1000, sets)
		store().navigate(1) // no next group
		expect(store().active?.index).toBe(0)
	})
})

describe('reset', () => {
	it('T25: clears all state', () => {
		store().init('wks_1', 1000, [makeSet()])
		store().startSet()
		store().confirmSet()

		store().reset()

		expect(store().sessionId).toBeNull()
		expect(store().sessionStartedAt).toBeNull()
		expect(store().queue).toEqual([])
		expect(store().confirmedIndices).toEqual([])
		expect(store().active).toBeNull()
		expect(store().rest).toBeNull()
		expect(store()._roundStartedAt).toBeNull()
	})
})
