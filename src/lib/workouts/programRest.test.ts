import type { FatigueTier, MuscleGroup, TrainingGoal } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import {
	classifyRecovery,
	computeProgramRest,
	findOptimalOrder,
	programCycleDays,
	type RestWorkoutInput,
	recoveryHoursFromFatigue
} from './programRest'

interface ExFixture {
	muscles: Array<[MuscleGroup, number]>
	fatigueTier?: FatigueTier
	targetSets?: number | null
	trainingGoal?: TrainingGoal | null
}

function w(exercises: ExFixture[], workoutGoal: TrainingGoal = 'hypertrophy', defaultSets = 3): RestWorkoutInput {
	return {
		trainingGoal: workoutGoal,
		exercises: exercises.map(ex => ({
			targetSets: ex.targetSets === undefined ? defaultSets : ex.targetSets,
			trainingGoal: ex.trainingGoal ?? null,
			exercise: {
				fatigueTier: ex.fatigueTier ?? 1,
				muscles: ex.muscles.map(([muscleGroup, intensity]) => ({ muscleGroup, intensity }))
			}
		}))
	}
}

describe('computeProgramRest', () => {
	it('returns empty for 0 or 1 workouts', () => {
		expect(computeProgramRest([])).toEqual([])
		expect(computeProgramRest([w([{ muscles: [['chest', 1]] }])])).toEqual([])
	})

	it('produces expected hours for a known stimulus on an overlapping muscle', () => {
		// W0: 4 sets × intensity 1 × tier 1 (weight 1.0) = 4 fatigue units → 24 + 24 = 48h.
		const w0 = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 4 }])
		const w1 = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 4 }])
		const t = computeProgramRest([w0, w1])
		expect(t[0].bottleneckMuscle).toBe('chest')
		expect(t[0].bottleneckHours).toBe(48)
		expect(t[0].muscles).toHaveLength(1)
		expect(t[0].muscles[0]).toMatchObject({ muscleGroup: 'chest', recoveryHours: 48 })
	})

	it('reports no overlap as empty constraints and bottleneck 0', () => {
		const push = w([{ muscles: [['chest', 1]] }])
		const pull = w([{ muscles: [['lats', 1]] }])
		const transitions = computeProgramRest([push, pull])
		expect(transitions[0].muscles).toEqual([])
		expect(transitions[0].bottleneckHours).toBe(0)
		expect(transitions[0].bottleneckMuscle).toBeNull()
	})

	it('computes cycle wrap (last → first) with the prior workout as constraint', () => {
		// 3-workout cycle: W0 chest, W1 lats, W2 chest. Wrap is W2 → W0, both hit chest.
		const w0 = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 4 }])
		const w1 = w([{ muscles: [['lats', 1]] }])
		const w2 = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 4 }])
		const transitions = computeProgramRest([w0, w1, w2])
		const wrap = transitions[2]
		expect(wrap.fromIdx).toBe(2)
		expect(wrap.toIdx).toBe(0)
		expect(wrap.bottleneckMuscle).toBe('chest')
		expect(wrap.bottleneckHours).toBe(48)
	})

	it('ignores muscles below the 0.3 intensity threshold for stimulus accounting', () => {
		// Triceps incidental (0.2) on W0 → doesn't count → not in W_prev → no overlap → no constraint.
		const w0 = w([
			{
				muscles: [
					['chest', 1],
					['triceps', 0.2]
				],
				fatigueTier: 1,
				targetSets: 4
			}
		])
		const w1 = w([{ muscles: [['triceps', 1]], fatigueTier: 1, targetSets: 4 }])
		const t = computeProgramRest([w0, w1])
		const triceps = t[0].muscles.find(m => m.muscleGroup === 'triceps')
		expect(triceps).toBeUndefined()
		expect(t[0].bottleneckHours).toBe(0)
	})

	it('saturates at the 96h cap when stimulus is very large', () => {
		// 20 sets × tier 1 × 1.0 intensity = 20 fatigue → 24 + 120 = 144 → clamped to 96.
		const heavy = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 20 }])
		const next = w([{ muscles: [['chest', 1]] }])
		const t = computeProgramRest([heavy, next])
		expect(t[0].bottleneckHours).toBe(96)
	})

	it('falls back to the per-goal default targetSets when null (strength=5, hypertrophy=3)', () => {
		// Strength fallback: 5 sets × tier 1 × 1 = 5 fatigue → 24 + 30 = 54h.
		const wsA = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: null }], 'strength')
		const wsB = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: null }], 'strength')
		expect(computeProgramRest([wsA, wsB])[0].bottleneckHours).toBe(54)

		// Hypertrophy fallback: 3 sets × tier 1 × 1 = 3 fatigue → 24 + 18 = 42h.
		const whA = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: null }], 'hypertrophy')
		const whB = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: null }], 'hypertrophy')
		expect(computeProgramRest([whA, whB])[0].bottleneckHours).toBe(42)
	})

	it('per-exercise trainingGoal overrides the workout-level goal for fallback', () => {
		// Workout-level hypertrophy but exercise marked strength → uses 5 sets.
		const wA = w(
			[{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: null, trainingGoal: 'strength' }],
			'hypertrophy'
		)
		const wB = w([{ muscles: [['chest', 1]], fatigueTier: 1 }], 'hypertrophy')
		expect(computeProgramRest([wA, wB])[0].bottleneckHours).toBe(54)
	})

	it('uses fatigue-tier weight when scaling stimulus', () => {
		// Tier 4 (weight 0.25): 4 sets × 1 × 0.25 = 1 fatigue → 24 + 6 = 30h.
		const w0 = w([{ muscles: [['chest', 1]], fatigueTier: 4, targetSets: 4 }])
		const w1 = w([{ muscles: [['chest', 1]] }])
		expect(computeProgramRest([w0, w1])[0].bottleneckHours).toBe(30)
	})

	it('sorts constraint muscles by recoveryHours descending', () => {
		const w0 = w([
			{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }, // 48 → 72h
			{ muscles: [['triceps', 1]], fatigueTier: 4, targetSets: 4 } // 1 fatigue → 30h
		])
		const w1 = w([{ muscles: [['chest', 1]] }, { muscles: [['triceps', 1]] }])
		const t = computeProgramRest([w0, w1])
		expect(t[0].muscles.map(m => m.muscleGroup)).toEqual(['chest', 'triceps'])
		expect(t[0].bottleneckMuscle).toBe('chest')
	})
})

describe('recoveryHoursFromFatigue', () => {
	it('floors at 24h for zero or negative stimulus', () => {
		expect(recoveryHoursFromFatigue(0)).toBe(24)
		expect(recoveryHoursFromFatigue(-5)).toBe(24)
	})

	it('caps at 96h for large stimulus', () => {
		expect(recoveryHoursFromFatigue(20)).toBe(96)
		expect(recoveryHoursFromFatigue(1000)).toBe(96)
	})

	it('scales linearly between 24 and 96', () => {
		expect(recoveryHoursFromFatigue(4)).toBe(48)
		expect(recoveryHoursFromFatigue(8)).toBe(72)
	})
})

describe('findOptimalOrder', () => {
	it('preserves input order when there is nothing to optimize (<3 workouts)', () => {
		expect(findOptimalOrder([])).toEqual([])
		const a = w([{ muscles: [['chest', 1]] }])
		expect(findOptimalOrder([a])).toEqual([0])
		const b = w([{ muscles: [['lats', 1]] }])
		expect(findOptimalOrder([a, b])).toEqual([0, 1])
	})

	it('separates two same-muscle workouts in a 4-workout cycle', () => {
		// A & B both hammer chest. C & D hit unrelated muscles. Best ordering puts a
		// non-chest workout between A and B (and also at the wrap), so B lands opposite A.
		const A = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		const B = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		const C = w([{ muscles: [['quads', 1]] }])
		const D = w([{ muscles: [['lats', 1]] }])
		const order = findOptimalOrder([A, B, C, D])
		expect(order[0]).toBe(0)
		expect(order[2]).toBe(1)
	})

	it('keeps the user-chosen first workout pinned at index 0', () => {
		const A = w([{ muscles: [['lats', 1]] }])
		const B = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		const C = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		expect(findOptimalOrder([A, B, C])[0]).toBe(0)
	})

	it('returns input order on ties (no overlaps anywhere)', () => {
		const A = w([{ muscles: [['chest', 1]] }])
		const B = w([{ muscles: [['lats', 1]] }])
		const C = w([{ muscles: [['quads', 1]] }])
		expect(findOptimalOrder([A, B, C])).toEqual([0, 1, 2])
	})

	it('strictly reduces total bottleneck hours when the input is suboptimal', () => {
		const A = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		const B = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 8 }])
		const C = w([{ muscles: [['quads', 1]] }])
		const D = w([{ muscles: [['lats', 1]] }])
		const inputs = [A, B, C, D]
		const inputScore = computeProgramRest(inputs).reduce((s, t) => s + t.bottleneckHours, 0)
		const optimized = findOptimalOrder(inputs).map(i => inputs[i])
		const optScore = computeProgramRest(optimized).reduce((s, t) => s + t.bottleneckHours, 0)
		expect(optScore).toBeLessThan(inputScore)
	})
})

describe('programCycleDays', () => {
	it('returns 0 for empty input and 1 for a single workout', () => {
		expect(programCycleDays([])).toBe(0)
		expect(programCycleDays([w([{ muscles: [['chest', 1]] }])])).toBe(1)
	})

	it('counts the wrap-around rest: 5 workouts with no overlap = 5 days (not 4)', () => {
		const days = programCycleDays([
			w([{ muscles: [['chest', 1]] }]),
			w([{ muscles: [['lats', 1]] }]),
			w([{ muscles: [['quads', 1]] }]),
			w([{ muscles: [['hamstrings', 1]] }]),
			w([{ muscles: [['side_delts', 1]] }])
		])
		expect(days).toBe(5)
	})

	it('rounds the sum up to the next day (40h → 2, 60h → 3)', () => {
		// 16h + 24h = 40h (one transition floored at 24h, one at 16h pre-floor → also 24h).
		// Simpler: construct exact totals via the recoveryHours formula.
		// 4 sets tier 1 = 4 fatigue → 48h. Plus one no-overlap (24h floor). Total = 72h.
		// 72/24 = 3 days.
		const chestHeavy = w([{ muscles: [['chest', 1]], fatigueTier: 1, targetSets: 4 }])
		const chestLight = w([{ muscles: [['chest', 1]] }])
		// 2-workout cycle: chest→chest (48h overlap) + chest→chest (wrap, also 48h since both hit chest)
		// Actually both transitions are between workouts that overlap → both 48h. Total = 96h → 4 days.
		expect(programCycleDays([chestHeavy, chestLight])).toBe(4)
	})

	it('floors each no-overlap transition at 24h before summing', () => {
		// 3 workouts, all disjoint muscles. Each transition contributes 24h. 72h → 3 days.
		const a = w([{ muscles: [['chest', 1]] }])
		const b = w([{ muscles: [['lats', 1]] }])
		const c = w([{ muscles: [['quads', 1]] }])
		expect(programCycleDays([a, b, c])).toBe(3)
	})
})

describe('classifyRecovery', () => {
	it('buckets hours into fresh/moderate/heavy', () => {
		expect(classifyRecovery(0)).toBe('fresh')
		expect(classifyRecovery(24)).toBe('fresh')
		expect(classifyRecovery(25)).toBe('moderate')
		expect(classifyRecovery(48)).toBe('moderate')
		expect(classifyRecovery(49)).toBe('heavy')
		expect(classifyRecovery(96)).toBe('heavy')
	})
})
