import { describe, expect, it } from 'vitest'
import { generateBackoffSets, splitTargetSets, type TargetSetSplitInput } from './sets'

function split(overrides: Partial<TargetSetSplitInput> = {}) {
	return splitTargetSets({ setMode: 'full', targetSets: 3, targetReps: 8, targetWeight: 80, ...overrides })
}

describe('generateBackoffSets', () => {
	it('drops 20% per step and adds 2 reps, rounded up to a plate increment', () => {
		// 80 × 0.8 = 64 → up to the 2.5kg increment = 65; 80 × 0.7 = 56 → 57.5
		expect(generateBackoffSets(80, 8)).toEqual([
			{ weightKg: 65, reps: 10, setType: 'backoff' },
			{ weightKg: 57.5, reps: 12, setType: 'backoff' }
		])
	})

	it('respects the count argument', () => {
		expect(generateBackoffSets(80, 8, 1)).toHaveLength(1)
	})

	it('bodyweight exercises take the rep increase at +0 added kg', () => {
		expect(generateBackoffSets(0, 6, 2, 1)).toEqual([
			{ weightKg: 0, reps: 8, setType: 'backoff' },
			{ weightKg: 0, reps: 10, setType: 'backoff' }
		])
	})
})

describe('splitTargetSets', () => {
	it('folds one backoff into targetSets for full mode', () => {
		expect(split()).toEqual({ workingCount: 2, backoff: { weightKg: 65, reps: 10, setType: 'backoff' } })
	})

	it('folds one backoff into targetSets for backoff mode', () => {
		expect(split({ setMode: 'backoff' }).workingCount).toBe(2)
	})

	it('leaves working and warmup modes whole — warmups are additive, not folded', () => {
		expect(split({ setMode: 'working' })).toEqual({ workingCount: 3, backoff: null })
		expect(split({ setMode: 'warmup' })).toEqual({ workingCount: 3, backoff: null })
	})

	it('never drops below one working set', () => {
		expect(split({ targetSets: 1 }).workingCount).toBe(1)
	})

	it('keeps every set working when there is no load to back off from', () => {
		expect(split({ targetWeight: null })).toEqual({ workingCount: 3, backoff: null })
		expect(split({ targetWeight: 0 })).toEqual({ workingCount: 3, backoff: null })
	})

	it('keeps every set working when the row has no target reps', () => {
		expect(split({ targetReps: 0 })).toEqual({ workingCount: 3, backoff: null })
	})

	it('bodyweight rows produce a backoff without a target weight', () => {
		expect(split({ targetWeight: null, bwMultiplier: 1, targetReps: 6 })).toEqual({
			workingCount: 2,
			backoff: { weightKg: 0, reps: 8, setType: 'backoff' }
		})
	})
})
