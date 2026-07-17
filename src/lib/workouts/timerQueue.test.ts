import type { Exercise } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import type { FlatSet, SessionLog } from './sets'
import {
	confirmOutcome,
	cursorEquals,
	cursorIndex,
	cursorOf,
	dismissOutcome,
	nextExercisePendingIndex,
	nextPendingIndex,
	nextPendingWrapped,
	resolveCursorIndex,
	undoCursor
} from './timerQueue'

const exc = (id: string) => id as Exercise['id']

function makeSet(overrides: Partial<FlatSet> = {}): FlatSet {
	return {
		exerciseId: exc('exc_bench'),
		exerciseName: 'Bench Press',
		setType: 'working',
		weightKg: 80,
		reps: 8,
		setNumber: 1,
		totalSets: 3,
		transition: false,
		itemIndex: 0,
		completed: false,
		bwMultiplier: 0,
		fatigueTier: 2,
		goal: 'hypertrophy',
		log: null,
		superset: null,
		...overrides
	}
}

describe('cursor identity', () => {
	it('cursorOf extracts stable identity', () => {
		expect(cursorOf(makeSet({ setNumber: 2 }))).toEqual({ exerciseId: 'exc_bench', setNumber: 2 })
	})

	it('cursorEquals compares by value, handles null', () => {
		expect(cursorEquals(null, null)).toBe(true)
		expect(cursorEquals({ exerciseId: exc('a'), setNumber: 1 }, null)).toBe(false)
		expect(cursorEquals({ exerciseId: exc('a'), setNumber: 1 }, { exerciseId: exc('a'), setNumber: 1 })).toBe(true)
		expect(cursorEquals({ exerciseId: exc('a'), setNumber: 1 }, { exerciseId: exc('a'), setNumber: 2 })).toBe(false)
	})

	it('cursorIndex finds the matching set, -1 when gone', () => {
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		expect(cursorIndex(queue, { exerciseId: exc('exc_bench'), setNumber: 2 })).toBe(1)
		expect(cursorIndex(queue, { exerciseId: exc('exc_bench'), setNumber: 9 })).toBe(-1)
		expect(cursorIndex(queue, null)).toBe(-1)
	})
})

describe('nextPendingIndex', () => {
	it('finds first pending at or after from', () => {
		const queue = [makeSet({ completed: true }), makeSet({ setNumber: 2 }), makeSet({ setNumber: 3 })]
		expect(nextPendingIndex(queue)).toBe(1)
		expect(nextPendingIndex(queue, 2)).toBe(2)
	})

	it('-1 when nothing pending', () => {
		expect(nextPendingIndex([makeSet({ completed: true })])).toBe(-1)
		expect(nextPendingIndex([])).toBe(-1)
	})
})

describe('resolveCursorIndex', () => {
	const queue = [makeSet({ setNumber: 1, completed: true }), makeSet({ setNumber: 2 }), makeSet({ setNumber: 3 })]

	it('null cursor → first pending', () => {
		expect(resolveCursorIndex(queue, null)).toBe(1)
	})

	it('keeps an existing cursor even when its set is completed (post-confirm review)', () => {
		expect(resolveCursorIndex(queue, { exerciseId: exc('exc_bench'), setNumber: 1 })).toBe(0)
	})

	it('dangling cursor (set removed by template edit) → first pending', () => {
		expect(resolveCursorIndex(queue, { exerciseId: exc('exc_gone'), setNumber: 1 })).toBe(1)
	})

	it('-1 when all sets are logged and cursor is null', () => {
		expect(resolveCursorIndex([makeSet({ completed: true })], null)).toBe(-1)
	})
})

describe('nextPendingWrapped', () => {
	it('prefers the next pending ahead', () => {
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2, completed: true }), makeSet({ setNumber: 3 })]
		expect(nextPendingWrapped(queue, 0)).toBe(2)
	})

	it('wraps to the start when nothing pending ahead', () => {
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2, completed: true })]
		expect(nextPendingWrapped(queue, 1)).toBe(0)
	})

	it('exclude skips the just-confirmed set whose optimistic log has not landed', () => {
		// Set 0 confirmed but still flagged pending; it is the only "pending" set left
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2, completed: true })]
		expect(nextPendingWrapped(queue, 0, 0)).toBe(-1)
	})

	it('-1 when everything is completed', () => {
		expect(nextPendingWrapped([makeSet({ completed: true })], 0)).toBe(-1)
	})
})

describe('nextExercisePendingIndex', () => {
	const queue = [
		makeSet({ exerciseId: exc('exc_a'), itemIndex: 0, setNumber: 1, completed: true }),
		makeSet({ exerciseId: exc('exc_a'), itemIndex: 0, setNumber: 2 }),
		makeSet({ exerciseId: exc('exc_b'), itemIndex: 1, setNumber: 1 }),
		makeSet({ exerciseId: exc('exc_c'), itemIndex: 2, setNumber: 1 })
	]

	it('direction=1 → first pending set of a later group', () => {
		expect(nextExercisePendingIndex(queue, 1, 1)).toBe(2)
	})

	it('direction=-1 → last pending set of an earlier group, skipping completed', () => {
		expect(nextExercisePendingIndex(queue, 3, -1)).toBe(2)
		// From exc_b: exc_a's completed set 1 is skipped, pending set 2 is the target
		expect(nextExercisePendingIndex(queue, 2, -1)).toBe(1)
	})

	it('-1 when no pending group in that direction or fromIndex invalid', () => {
		expect(nextExercisePendingIndex(queue, 3, 1)).toBe(-1)
		expect(nextExercisePendingIndex(queue, -1, 1)).toBe(-1)
	})
})

describe('confirmOutcome', () => {
	it('mid-superset transition → advance to the next pending set', () => {
		const queue = [
			makeSet({ exerciseId: exc('exc_a'), transition: true }),
			makeSet({ exerciseId: exc('exc_b'), transition: false })
		]
		expect(confirmOutcome(queue, 0)).toEqual({
			action: 'advance',
			next: { exerciseId: 'exc_b', setNumber: 1 }
		})
	})

	it('last-in-round (non-transition) → rest, cursor holds', () => {
		const queue = [
			makeSet({ exerciseId: exc('exc_a'), transition: true }),
			makeSet({ exerciseId: exc('exc_b'), transition: false })
		]
		expect(confirmOutcome(queue, 1)).toEqual({ action: 'rest' })
	})

	it('transition with nothing else pending → advance to null, never back to the confirmed set', () => {
		// The confirmed set still reads pending — its optimistic log may not have landed
		const queue = [makeSet({ transition: true }), makeSet({ setNumber: 2, completed: true })]
		expect(confirmOutcome(queue, 0)).toEqual({ action: 'advance', next: null })
	})

	it('out-of-range index → rest', () => {
		expect(confirmOutcome([], 0)).toEqual({ action: 'rest' })
	})
})

describe('dismissOutcome', () => {
	it('completed set → advance to the next pending set', () => {
		const queue = [makeSet({ completed: true }), makeSet({ setNumber: 2 })]
		expect(dismissOutcome(queue, 0)).toEqual({
			advance: true,
			next: { exerciseId: 'exc_bench', setNumber: 2 }
		})
	})

	it('wraps to an earlier pending set', () => {
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2, completed: true })]
		expect(dismissOutcome(queue, 1)).toEqual({
			advance: true,
			next: { exerciseId: 'exc_bench', setNumber: 1 }
		})
	})

	it('nothing pending anywhere → advance to null (workout done)', () => {
		expect(dismissOutcome([makeSet({ completed: true })], 0)).toEqual({ advance: true, next: null })
	})

	it('parked on a pending set (checklist-started rest) → no advance, the set is not skipped', () => {
		const queue = [makeSet({ setNumber: 1 }), makeSet({ setNumber: 2 })]
		expect(dismissOutcome(queue, 0)).toEqual({ advance: false })
	})

	it('invalid index → no advance', () => {
		expect(dismissOutcome([makeSet()], -1)).toEqual({ advance: false })
	})
})

describe('undoCursor', () => {
	const logged = (id: string) => ({ id }) as unknown as FlatSet['log']

	it('lands on the slot the removed log frees up', () => {
		const queue = [
			makeSet({ setNumber: 1, completed: true, log: logged('wkl_1') }),
			makeSet({ setNumber: 2, completed: true, log: logged('wkl_2') })
		]
		expect(undoCursor(queue, 'wkl_2' as SessionLog['id'])).toEqual({
			exerciseId: 'exc_bench',
			setNumber: 2
		})
	})

	it('log outside the queue (ad-hoc extra) → null', () => {
		expect(undoCursor([makeSet()], 'wkl_extra' as SessionLog['id'])).toBeNull()
	})
})
