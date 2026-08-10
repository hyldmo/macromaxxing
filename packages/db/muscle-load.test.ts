import { describe, expect, it } from 'vitest'
import {
	classifyIntensity,
	classifyZone,
	computeBalances,
	computeMuscleLoad,
	FATIGUE_TIER_WEIGHTS,
	type MuscleContribution,
	type PlannedRow,
	plannedRowContributions,
	sumTotals,
	VOLUME_LANDMARKS,
	withZones
} from './muscle-load'

function contribution(overrides: Partial<MuscleContribution> = {}): MuscleContribution {
	return {
		muscleGroup: 'chest',
		intensity: 1.0,
		sets: 3,
		exerciseType: 'compound',
		fatigueTier: 2,
		trainingGoal: 'hypertrophy',
		...overrides
	}
}

describe('classifyIntensity', () => {
	it('bucket thresholds', () => {
		expect(classifyIntensity(1.0)).toBe('primary')
		expect(classifyIntensity(0.8)).toBe('primary')
		expect(classifyIntensity(0.79)).toBe('secondary')
		expect(classifyIntensity(0.3)).toBe('secondary')
		expect(classifyIntensity(0.29)).toBe('incidental')
		expect(classifyIntensity(0)).toBe('incidental')
	})
})

describe('classifyZone', () => {
	const lm = VOLUME_LANDMARKS.chest // 8/16/22

	it('below MEV', () => {
		expect(classifyZone(0, lm)).toBe('below_mev')
		expect(classifyZone(7, lm)).toBe('below_mev')
	})

	it('MEV band', () => {
		expect(classifyZone(8, lm)).toBe('mev')
		expect(classifyZone(15, lm)).toBe('mev')
	})

	it('MAV band', () => {
		expect(classifyZone(16, lm)).toBe('mav')
		expect(classifyZone(21, lm)).toBe('mav')
	})

	it('MRV exact', () => {
		expect(classifyZone(22, lm)).toBe('mrv')
	})

	it('above MRV', () => {
		expect(classifyZone(23, lm)).toBe('above_mrv')
	})
})

describe('computeMuscleLoad', () => {
	it('returns an entry for every muscle group (zeros included)', () => {
		const result = computeMuscleLoad([])
		expect(result).toHaveLength(14)
		expect(result.every(r => r.workingSets === 0)).toBe(true)
	})

	it('sums working sets weighted by intensity', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 3, intensity: 1.0 }),
			contribution({ muscleGroup: 'chest', sets: 2, intensity: 0.5 })
		])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.workingSets).toBe(4) // 3*1 + 2*0.5
	})

	it('computes volume from weight × reps × sets × intensity', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 3, intensity: 1.0, reps: 10, weightKg: 100 }),
			contribution({ muscleGroup: 'chest', sets: 2, intensity: 0.3, reps: 8, weightKg: 50 })
		])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.volumeKg).toBe(3 * 10 * 100 + 2 * 8 * 50 * 0.3)
	})

	it('skips volume when weight/reps missing', () => {
		const result = computeMuscleLoad([contribution({ sets: 3 })])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.volumeKg).toBe(0)
		expect(chest.workingSets).toBe(3)
	})

	it('weights fatigue load by tier', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'quads', sets: 3, fatigueTier: 1 }),
			contribution({ muscleGroup: 'quads', sets: 3, fatigueTier: 4 })
		])
		const quads = result.find(r => r.muscleGroup === 'quads')!
		const expected = 3 * FATIGUE_TIER_WEIGHTS[1] + 3 * FATIGUE_TIER_WEIGHTS[4]
		expect(quads.fatigueLoad).toBeCloseTo(expected)
	})

	it('splits compound vs isolation sets', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 3, exerciseType: 'compound' }),
			contribution({ muscleGroup: 'chest', sets: 2, exerciseType: 'isolation' })
		])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.compoundSets).toBe(3)
		expect(chest.isolationSets).toBe(2)
	})

	it('splits intensity buckets', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 1, intensity: 1.0 }),
			contribution({ muscleGroup: 'chest', sets: 1, intensity: 0.5 }),
			contribution({ muscleGroup: 'chest', sets: 1, intensity: 0.1 })
		])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.primarySets).toBeCloseTo(1.0)
		expect(chest.secondarySets).toBeCloseTo(0.5)
		expect(chest.incidentalSets).toBeCloseTo(0.1)
	})

	it('splits strength vs hypertrophy goal', () => {
		const result = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 3, trainingGoal: 'strength' }),
			contribution({ muscleGroup: 'chest', sets: 2, trainingGoal: 'hypertrophy' })
		])
		const chest = result.find(r => r.muscleGroup === 'chest')!
		expect(chest.strengthSets).toBe(3)
		expect(chest.hypertrophySets).toBe(2)
	})
})

describe('withZones', () => {
	it('adds zone + landmark to each muscle', () => {
		const loads = computeMuscleLoad([contribution({ muscleGroup: 'chest', sets: 14, intensity: 1.0 })])
		const zoned = withZones(loads)
		const chest = zoned.find(l => l.muscleGroup === 'chest')!
		expect(chest.zone).toBe('mev')
		expect(chest.landmark).toEqual(VOLUME_LANDMARKS.chest)
	})
})

describe('computeBalances', () => {
	it('computes push_pull ratio', () => {
		const loads = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 10, intensity: 1.0 }),
			contribution({ muscleGroup: 'front_delts', sets: 2, intensity: 1.0 }),
			contribution({ muscleGroup: 'triceps', sets: 4, intensity: 1.0 }),
			contribution({ muscleGroup: 'upper_back', sets: 8, intensity: 1.0 }),
			contribution({ muscleGroup: 'lats', sets: 4, intensity: 1.0 }),
			contribution({ muscleGroup: 'biceps', sets: 4, intensity: 1.0 })
		])
		const balances = computeBalances(loads)
		const pushPull = balances.find(b => b.name === 'push_pull')!
		expect(pushPull.numerator).toBe(16)
		expect(pushPull.denominator).toBe(16)
		expect(pushPull.ratio).toBe(1)
	})

	it('returns null ratio when denominator is zero', () => {
		const loads = computeMuscleLoad([contribution({ muscleGroup: 'chest', sets: 5, intensity: 1.0 })])
		const balances = computeBalances(loads)
		const pushPull = balances.find(b => b.name === 'push_pull')!
		expect(pushPull.denominator).toBe(0)
		expect(pushPull.ratio).toBeNull()
	})
})

describe('sumTotals', () => {
	it('rolls up per-muscle numbers and counts muscles trained', () => {
		const loads = computeMuscleLoad([
			contribution({ muscleGroup: 'chest', sets: 3, intensity: 1.0, reps: 10, weightKg: 100 }),
			contribution({ muscleGroup: 'triceps', sets: 3, intensity: 0.5, reps: 10, weightKg: 100 })
		])
		const totals = sumTotals(loads)
		expect(totals.workingSets).toBeCloseTo(3 + 1.5)
		expect(totals.volumeKg).toBeCloseTo(3 * 10 * 100 + 3 * 10 * 100 * 0.5)
		expect(totals.musclesTrained).toBe(2)
	})
})

function plannedRow(overrides: Partial<PlannedRow> = {}): PlannedRow {
	return {
		setMode: 'full',
		targetSets: 3,
		targetReps: 8,
		targetWeight: 80,
		trainingGoal: null,
		exercise: {
			type: 'compound',
			fatigueTier: 2,
			bwMultiplier: 0,
			muscles: [{ muscleGroup: 'chest', intensity: 1.0 }],
			equipment: [{ equipment: 'barbell' }]
		},
		...overrides
	}
}

describe('plannedRowContributions', () => {
	it('counts targetSets as hard sets — warmups are additive and never included', () => {
		// `full` generates a warmup ramp on top of targetSets; only the 3 prescribed sets count.
		const loads = computeMuscleLoad(plannedRowContributions(plannedRow(), 'hypertrophy', null))
		expect(loads.find(l => l.muscleGroup === 'chest')!.workingSets).toBe(3)
	})

	it('prices the folded backoff at its generated load, not the top-set numbers', () => {
		const loads = computeMuscleLoad(plannedRowContributions(plannedRow(), 'hypertrophy', null))
		// 2 working @ 80×8 + 1 backoff @ 65×10, vs the old 3 × 80×8 = 1920.
		expect(loads.find(l => l.muscleGroup === 'chest')!.volumeKg).toBe(2 * 80 * 8 + 65 * 10)
	})

	it('working mode prices every set at the target load', () => {
		const loads = computeMuscleLoad(
			plannedRowContributions(plannedRow({ setMode: 'working' }), 'hypertrophy', null)
		)
		expect(loads.find(l => l.muscleGroup === 'chest')!.volumeKg).toBe(3 * 80 * 8)
	})

	it('weights each muscle by its intensity across both doses', () => {
		const row = plannedRow({
			exercise: {
				type: 'compound',
				fatigueTier: 2,
				bwMultiplier: 0,
				muscles: [
					{ muscleGroup: 'chest', intensity: 1.0 },
					{ muscleGroup: 'triceps', intensity: 0.5 }
				],
				equipment: [{ equipment: 'barbell' }]
			}
		})
		const loads = computeMuscleLoad(plannedRowContributions(row, 'hypertrophy', null))
		expect(loads.find(l => l.muscleGroup === 'triceps')!.workingSets).toBeCloseTo(1.5)
		expect(loads.find(l => l.muscleGroup === 'triceps')!.volumeKg).toBeCloseTo((2 * 80 * 8 + 65 * 10) * 0.5)
	})

	it('resolves the bodyweight fraction into the effective load for both doses', () => {
		const row = plannedRow({
			targetWeight: 10,
			targetReps: 6,
			exercise: {
				type: 'compound',
				fatigueTier: 2,
				bwMultiplier: 1,
				muscles: [{ muscleGroup: 'lats', intensity: 1.0 }],
				equipment: [{ equipment: 'pullup_bar' }]
			}
		})
		const loads = computeMuscleLoad(plannedRowContributions(row, 'hypertrophy', 80))
		// 2 working @ (80 + 10) × 6, backoff sheds the added kg only: (80 + 0) × 8.
		expect(loads.find(l => l.muscleGroup === 'lats')!.volumeKg).toBe(2 * 90 * 6 + 80 * 8)
	})

	it('falls back to the parent goal and its default set count', () => {
		const loads = computeMuscleLoad(
			plannedRowContributions(plannedRow({ targetSets: null, setMode: 'working' }), 'strength', null)
		)
		const chest = loads.find(l => l.muscleGroup === 'chest')!
		expect(chest.workingSets).toBe(5)
		expect(chest.strengthSets).toBe(5)
	})

	it('per-exercise goal overrides the parent goal', () => {
		const loads = computeMuscleLoad(
			plannedRowContributions(plannedRow({ trainingGoal: 'strength' }), 'hypertrophy', null)
		)
		expect(loads.find(l => l.muscleGroup === 'chest')!.strengthSets).toBe(3)
	})

	it('doubles a dumbbell row’s volume without touching its set count', () => {
		const bells = plannedRow({
			setMode: 'working',
			targetSets: 3,
			targetReps: 10,
			targetWeight: 30,
			exercise: {
				type: 'isolation',
				fatigueTier: 4,
				bwMultiplier: 0,
				muscles: [{ muscleGroup: 'side_delts', intensity: 1.0 }],
				equipment: [{ equipment: 'dumbbell' }]
			}
		})
		const delts = computeMuscleLoad(plannedRowContributions(bells, 'hypertrophy', null)).find(
			l => l.muscleGroup === 'side_delts'
		)!
		expect(delts.volumeKg).toBe(3 * 30 * 10 * 2)
		// MEV/MAV/MRV counts sets, and a lateral raise is still three sets.
		expect(delts.workingSets).toBe(3)
	})

	it('contributes no volume when the row has no target weight yet', () => {
		const loads = computeMuscleLoad(
			plannedRowContributions(plannedRow({ targetWeight: null }), 'hypertrophy', null)
		)
		const chest = loads.find(l => l.muscleGroup === 'chest')!
		expect(chest.workingSets).toBe(3)
		expect(chest.volumeKg).toBe(0)
	})
})
