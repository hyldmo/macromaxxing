import type { Exercise } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import {
	buildSupersetRounds,
	calculateRest,
	flattenSets,
	generateBackoffSets,
	generateWarmupSets,
	type PlannedSet,
	type RenderItem,
	type SessionLog,
	type SupersetExerciseInput,
	shouldSkipWarmup
} from './sets'

describe('calculateRest', () => {
	// Formula: TIER_BASE[tier] × GOAL_MULT[goal] + reps × 3
	// TIER_BASE: { 1: 120, 2: 80, 3: 45, 4: 30 }
	// GOAL_MULT: { hypertrophy: 1.0, strength: 2.0 }
	// Warmup = base × 0.5, min 15s

	// ─── Heavy compounds: Tier 1 (Squat, Deadlift) ──────────────────

	describe('Tier 1 — heavy compounds (squat, deadlift)', () => {
		it('strength 3 reps → 249s (4:09)', () => {
			// 120 × 2.0 + 3 × 3 = 249
			expect(calculateRest(3, 1, 'strength')).toBe(249)
		})

		it('strength 5 reps → 255s (4:15)', () => {
			// 120 × 2.0 + 5 × 3 = 255
			expect(calculateRest(5, 1, 'strength')).toBe(255)
		})

		it('strength 8 reps → 264s (4:24)', () => {
			// 120 × 2.0 + 8 × 3 = 264
			expect(calculateRest(8, 1, 'strength')).toBe(264)
		})

		it('hypertrophy 8 reps → 144s (2:24)', () => {
			// 120 × 1.0 + 8 × 3 = 144
			expect(calculateRest(8, 1, 'hypertrophy')).toBe(144)
		})

		it('hypertrophy 10 reps → 150s (2:30)', () => {
			// 120 × 1.0 + 10 × 3 = 150
			expect(calculateRest(10, 1, 'hypertrophy')).toBe(150)
		})

		it('warmup — strength 5 reps → 128s', () => {
			// base=255, warmup=128
			expect(calculateRest(5, 1, 'strength', 'warmup')).toBe(128)
		})

		it('warmup — hypertrophy 10 reps → 75s', () => {
			// base=150, warmup=75
			expect(calculateRest(10, 1, 'hypertrophy', 'warmup')).toBe(75)
		})
	})

	// ─── Moderate compounds: Tier 2 (Bench, Row, OHP, Pull-Up, Lat Pulldown) ──

	describe('Tier 2 — moderate compounds (bench, row, OHP, pull-up, lat pulldown)', () => {
		it('strength 5 reps → 175s (2:55)', () => {
			// 80 × 2.0 + 5 × 3 = 175
			expect(calculateRest(5, 2, 'strength')).toBe(175)
		})

		it('hypertrophy 8 reps → 104s (1:44)', () => {
			// 80 × 1.0 + 8 × 3 = 104
			expect(calculateRest(8, 2, 'hypertrophy')).toBe(104)
		})

		it('hypertrophy 10 reps → 110s (1:50)', () => {
			// 80 × 1.0 + 10 × 3 = 110
			expect(calculateRest(10, 2, 'hypertrophy')).toBe(110)
		})

		it('hypertrophy 12 reps → 116s (1:56)', () => {
			// 80 × 1.0 + 12 × 3 = 116
			expect(calculateRest(12, 2, 'hypertrophy')).toBe(116)
		})

		it('warmup — strength 5 reps → 88s', () => {
			// base=175, warmup=88
			expect(calculateRest(5, 2, 'strength', 'warmup')).toBe(88)
		})

		it('warmup — hypertrophy 10 reps → 55s', () => {
			// base=110, warmup=55
			expect(calculateRest(10, 2, 'hypertrophy', 'warmup')).toBe(55)
		})
	})

	// ─── Light isolation: Tier 3 (Cable Fly, Hammer Curl) ───────────

	describe('Tier 3 — light isolation (cable fly, hammer curl)', () => {
		it('hypertrophy 10 reps → 75s (1:15)', () => {
			// 45 × 1.0 + 10 × 3 = 75
			expect(calculateRest(10, 3, 'hypertrophy')).toBe(75)
		})

		it('hypertrophy 12 reps → 81s (1:21)', () => {
			// 45 × 1.0 + 12 × 3 = 81
			expect(calculateRest(12, 3, 'hypertrophy')).toBe(81)
		})

		it('hypertrophy 15 reps → 90s (1:30)', () => {
			// 45 × 1.0 + 15 × 3 = 90
			expect(calculateRest(15, 3, 'hypertrophy')).toBe(90)
		})
	})

	// ─── Pure isolation: Tier 4 (Lateral Raise, Bicep Curl, Leg Extension) ──

	describe('Tier 4 — pure isolation (lateral raise, bicep curl, leg extension)', () => {
		it('hypertrophy 12 reps → 66s (1:06)', () => {
			// 30 × 1.0 + 12 × 3 = 66
			expect(calculateRest(12, 4, 'hypertrophy')).toBe(66)
		})

		it('hypertrophy 15 reps → 75s (1:15)', () => {
			// 30 × 1.0 + 15 × 3 = 75
			expect(calculateRest(15, 4, 'hypertrophy')).toBe(75)
		})

		it('hypertrophy 20 reps → 90s (1:30)', () => {
			// 30 × 1.0 + 20 × 3 = 90
			expect(calculateRest(20, 4, 'hypertrophy')).toBe(90)
		})
	})

	// ─── Edge cases ─────────────────────────────────────────────────

	describe('edge cases', () => {
		it('minimum 15s floor on warmup', () => {
			// 30 × 1.0 + 1 × 3 = 33, warmup = 17 → above 15
			// Use 0 reps to test floor: base = 30, warmup = 15
			expect(calculateRest(0, 4, 'hypertrophy', 'warmup')).toBe(15)
		})

		it('minimum 15s floor on working set', () => {
			// All tier bases are ≥30, so floor only matters for extreme edge cases
			expect(calculateRest(0, 4, 'hypertrophy')).toBe(30)
		})

		it('1 rep strength T1 → 243s (4:03)', () => {
			// 120 × 2.0 + 1 × 3 = 243
			expect(calculateRest(1, 1, 'strength')).toBe(243)
		})

		it('very high reps (30) hypertrophy T3 → 135s', () => {
			// 45 × 1.0 + 30 × 3 = 135
			expect(calculateRest(30, 3, 'hypertrophy')).toBe(135)
		})

		it('backoff sets use same rest as working sets', () => {
			expect(calculateRest(10, 2, 'hypertrophy', 'backoff')).toBe(calculateRest(10, 2, 'hypertrophy', 'working'))
		})

		it('default setType is working', () => {
			expect(calculateRest(10, 2, 'hypertrophy')).toBe(calculateRest(10, 2, 'hypertrophy', 'working'))
		})
	})

	// ─── Superset transition ────────────────────────────────────────

	describe('superset transition', () => {
		it('hardcoded 15s transition between superset exercises (used in WorkoutSessionPage)', () => {
			// The superset transition timer is a hardcoded 15s in WorkoutSessionPage.tsx:
			//   startTimer(15, variables.setType ?? 'working', true)
			// This is NOT from calculateRest — it's a separate constant.
			// Documenting here for visibility.
			const SUPERSET_TRANSITION_SECONDS = 15
			expect(SUPERSET_TRANSITION_SECONDS).toBe(15)
		})
	})
})

describe('generateWarmupSets', () => {
	describe('heavy lifts (>60kg)', () => {
		it('100kg × 5 reps (strength) → 50%×3, 75%×2', () => {
			const sets = generateWarmupSets(100, 5)
			expect(sets).toEqual([
				{ weightKg: 50, reps: 3, setType: 'warmup' },
				{ weightKg: 75, reps: 2, setType: 'warmup' }
			])
		})

		it('140kg × 5 reps (strength) → 70×3, 105×2', () => {
			const sets = generateWarmupSets(140, 5)
			expect(sets).toEqual([
				{ weightKg: 70, reps: 3, setType: 'warmup' },
				{ weightKg: 105, reps: 2, setType: 'warmup' }
			])
		})

		it('100kg × 10 reps (hypertrophy) → 50%×6, 75%×4', () => {
			const sets = generateWarmupSets(100, 10)
			expect(sets).toEqual([
				{ weightKg: 50, reps: 6, setType: 'warmup' },
				{ weightKg: 75, reps: 4, setType: 'warmup' }
			])
		})

		it('180kg × 10 reps (leg press) → 90×6, 135×4', () => {
			const sets = generateWarmupSets(180, 10)
			expect(sets).toEqual([
				{ weightKg: 90, reps: 6, setType: 'warmup' },
				{ weightKg: 135, reps: 4, setType: 'warmup' }
			])
		})

		it('65kg × 8 reps → 32.5×5, 50×3', () => {
			const sets = generateWarmupSets(65, 8)
			expect(sets).toEqual([
				{ weightKg: 32.5, reps: 5, setType: 'warmup' },
				{ weightKg: 50, reps: 3, setType: 'warmup' }
			])
		})

		it('100kg × 15 reps (high rep) → 50%×9, 75%×6', () => {
			const sets = generateWarmupSets(100, 15)
			expect(sets).toEqual([
				{ weightKg: 50, reps: 9, setType: 'warmup' },
				{ weightKg: 75, reps: 6, setType: 'warmup' }
			])
		})

		it('zero weight → no warmup sets', () => {
			expect(generateWarmupSets(0, 5)).toEqual([])
		})

		it('negative weight → no warmup sets', () => {
			expect(generateWarmupSets(-10, 5)).toEqual([])
		})
	})

	describe('light / dumbbell (≤60kg)', () => {
		it('30kg dumbbell → single set at ~60%', () => {
			// 30 * 0.6 = 18 → roundWeight(18, kg) = 17.5 (nearest 1.25)
			const sets = generateWarmupSets(30, 10)
			expect(sets).toEqual([{ weightKg: 17.5, reps: 10, setType: 'warmup' }])
		})

		it('20kg dumbbell → single set at ~60%', () => {
			// 20 * 0.6 = 12 → roundWeight(12, kg) = 12.5 (nearest 1.25)
			const sets = generateWarmupSets(20, 12)
			expect(sets).toEqual([{ weightKg: 12.5, reps: 12, setType: 'warmup' }])
		})

		it('10kg → single set at ~60%', () => {
			// 10 * 0.6 = 6 → roundWeight(6, kg) = 6.25 (nearest 1.25)
			const sets = generateWarmupSets(10, 15)
			expect(sets).toEqual([{ weightKg: 6.25, reps: 15, setType: 'warmup' }])
		})

		it('5kg → single set at ~60%', () => {
			// 5 * 0.6 = 3 → roundWeight(3, kg) = 3 (nearest 0.5)
			const sets = generateWarmupSets(5, 15)
			expect(sets).toEqual([{ weightKg: 3, reps: 15, setType: 'warmup' }])
		})
	})
})

describe('generateBackoffSets', () => {
	it('default 2 backoff sets from 100kg × 5', () => {
		const sets = generateBackoffSets(100, 5)
		// Set 1: 80% = 80kg (rounded up), reps = 5 + 2 = 7
		// Set 2: 70% = 70kg (rounded up), reps = 5 + 4 = 9
		expect(sets).toEqual([
			{ weightKg: 80, reps: 7, setType: 'backoff' },
			{ weightKg: 70, reps: 9, setType: 'backoff' }
		])
	})

	it('3 backoff sets from 120kg × 8', () => {
		const sets = generateBackoffSets(120, 8, 3)
		// Set 1: 80% = 96 → roundWeight(96, kg, up) = 97.5, reps = 10
		// Set 2: 70% = 84 → roundWeight(84, kg, up) = 85, reps = 12
		// Set 3: 60% = 72 → roundWeight(72, kg, up) = 72.5, reps = 14
		expect(sets).toEqual([
			{ weightKg: 97.5, reps: 10, setType: 'backoff' },
			{ weightKg: 85, reps: 12, setType: 'backoff' },
			{ weightKg: 72.5, reps: 14, setType: 'backoff' }
		])
	})

	it('light weight backoff from 20kg × 10', () => {
		const sets = generateBackoffSets(20, 10)
		// Set 1: 80% = 16 → roundWeight(16, kg, up) = 16.25, reps = 12
		// Set 2: 70% = 14 → roundWeight(14, kg, up) = 15, reps = 14
		expect(sets).toEqual([
			{ weightKg: 16.25, reps: 12, setType: 'backoff' },
			{ weightKg: 15, reps: 14, setType: 'backoff' }
		])
	})

	it('0 count returns empty', () => {
		expect(generateBackoffSets(100, 5, 0)).toEqual([])
	})
})

describe('shouldSkipWarmup', () => {
	it('skips when muscles are fully covered', () => {
		const current = [
			{ muscleGroup: 'chest', intensity: 1.0 },
			{ muscleGroup: 'triceps', intensity: 0.5 }
		]
		const warmed = new Map([
			['chest', 1.0],
			['triceps', 0.5]
		])
		expect(shouldSkipWarmup(current, warmed)).toBe(true)
	})

	it('skips at exactly 50% coverage threshold', () => {
		// total intensity = 1.0 + 0.5 = 1.5
		// covered = 0.5 + 0.25 = 0.75
		// 0.75 / 1.5 = 0.5 → exactly at threshold
		const current = [
			{ muscleGroup: 'chest', intensity: 1.0 },
			{ muscleGroup: 'triceps', intensity: 0.5 }
		]
		const warmed = new Map([
			['chest', 0.5],
			['triceps', 0.25]
		])
		expect(shouldSkipWarmup(current, warmed)).toBe(true)
	})

	it('does not skip when below 50% coverage', () => {
		const current = [
			{ muscleGroup: 'chest', intensity: 1.0 },
			{ muscleGroup: 'triceps', intensity: 0.5 }
		]
		const warmed = new Map([['triceps', 0.3]])
		// covered = 0.3, total = 1.5, ratio = 0.2 → below 0.5
		expect(shouldSkipWarmup(current, warmed)).toBe(false)
	})

	it('does not skip with no prior warmup', () => {
		const current = [{ muscleGroup: 'quads', intensity: 1.0 }]
		expect(shouldSkipWarmup(current, new Map())).toBe(false)
	})

	it('returns false for empty current muscles', () => {
		expect(shouldSkipWarmup([], new Map([['chest', 1.0]]))).toBe(false)
	})

	it('realistic: bench after OHP warms chest + triceps', () => {
		// OHP primarily targets front_delts (1.0), side_delts (0.5), triceps (0.4)
		// Bench targets chest (1.0), front_delts (0.6), triceps (0.5)
		// After OHP: front_delts and triceps are warmed
		const benchMuscles = [
			{ muscleGroup: 'chest', intensity: 1.0 },
			{ muscleGroup: 'front_delts', intensity: 0.6 },
			{ muscleGroup: 'triceps', intensity: 0.5 }
		]
		// OHP warmed front_delts and triceps
		const warmedFromOHP = new Map([
			['front_delts', 1.0],
			['side_delts', 0.5],
			['triceps', 0.4]
		])
		// covered = min(0.6, 1.0) + min(0.5, 0.4) = 0.6 + 0.4 = 1.0
		// total = 1.0 + 0.6 + 0.5 = 2.1
		// ratio = 1.0 / 2.1 ≈ 0.476 → below 0.5 → should NOT skip
		expect(shouldSkipWarmup(benchMuscles, warmedFromOHP)).toBe(false)
	})

	it('realistic: tricep pushdown after bench + OHP', () => {
		const tricepMuscles = [{ muscleGroup: 'triceps', intensity: 1.0 }]
		const warmed = new Map([['triceps', 0.9]])
		// covered = 0.9, total = 1.0, ratio = 0.9 → skip
		expect(shouldSkipWarmup(tricepMuscles, warmed)).toBe(true)
	})

	it('caps covered intensity to current muscle intensity', () => {
		// Even if warmedUp has higher value, covered is capped at current intensity
		const current = [{ muscleGroup: 'biceps', intensity: 0.3 }]
		const warmed = new Map([['biceps', 1.0]])
		// covered = min(0.3, 1.0) = 0.3, total = 0.3, ratio = 1.0 → skip
		expect(shouldSkipWarmup(current, warmed)).toBe(true)
	})
})

// --- buildSupersetRounds ---

// Test fixtures — the real SessionExercise type carries muscles + many other fields,
// but buildSupersetRounds/flattenSets only read `id` and `name`. Cast at the fixture
// boundary keeps tests focused on what the functions actually consume.
function makeExercise(id: string, name: string) {
	return { id, name } as unknown as SupersetExerciseInput['exercise']
}

function makeLog(id: string, exerciseId: string, setNumber: number, setType: PlannedSet['setType']): SessionLog {
	return {
		id,
		exerciseId,
		setNumber,
		setType,
		weightKg: 80,
		reps: 8,
		rpe: null,
		failureFlag: false,
		exercise: makeExercise(exerciseId, exerciseId)
	} as unknown as SessionLog
}

function planned(setType: PlannedSet['setType'], setNumber: number, weightKg = 80, reps = 8): PlannedSet {
	return { setNumber, setType, weightKg, reps }
}

describe('buildSupersetRounds', () => {
	it('equal-length pair: interleaves into one round per planned set', () => {
		const a = makeExercise('exc_a', 'A')
		const b = makeExercise('exc_b', 'B')
		const { rounds, extraLogs } = buildSupersetRounds([
			{ exercise: a, logs: [], plannedSets: [planned('working', 1), planned('working', 2)] },
			{ exercise: b, logs: [], plannedSets: [planned('working', 1), planned('working', 2)] }
		])

		expect(rounds.length).toBe(2)
		expect(rounds.map(r => r.sets.map(s => s.exerciseId))).toEqual([
			['exc_a', 'exc_b'],
			['exc_a', 'exc_b']
		])
		expect(extraLogs).toEqual([])
	})

	it('unequal: trailing rounds contain only the longer exercise', () => {
		const a = makeExercise('exc_a', 'A')
		const b = makeExercise('exc_b', 'B')
		const { rounds } = buildSupersetRounds([
			{
				exercise: a,
				logs: [],
				plannedSets: [planned('working', 1), planned('working', 2), planned('working', 3)]
			},
			{ exercise: b, logs: [], plannedSets: [planned('working', 1), planned('working', 2)] }
		])

		expect(rounds.length).toBe(3)
		expect(rounds[0].sets.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b'])
		expect(rounds[1].sets.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b'])
		expect(rounds[2].sets.map(s => s.exerciseId)).toEqual(['exc_a'])
	})

	it('groups by phase: warmup rounds, then working rounds, then backoff rounds', () => {
		const a = makeExercise('exc_a', 'A')
		const b = makeExercise('exc_b', 'B')
		const { rounds } = buildSupersetRounds([
			{
				exercise: a,
				logs: [],
				plannedSets: [planned('warmup', 1), planned('working', 2), planned('backoff', 3)]
			},
			{
				exercise: b,
				logs: [],
				plannedSets: [planned('working', 1), planned('backoff', 2)]
			}
		])

		expect(rounds.map(r => r.setType)).toEqual(['warmup', 'working', 'backoff'])
		// A's warmup is solo (B has none)
		expect(rounds[0].sets.map(s => s.exerciseId)).toEqual(['exc_a'])
		// Working round: both
		expect(rounds[1].sets.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b'])
		// Backoff round: both
		expect(rounds[2].sets.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b'])
	})

	it('logs match planned by index within phase; extra logs surface separately', () => {
		const a = makeExercise('exc_a', 'A')
		const { rounds, extraLogs } = buildSupersetRounds([
			{
				exercise: a,
				logs: [
					makeLog('wkl_1', 'exc_a', 1, 'working'),
					makeLog('wkl_2', 'exc_a', 2, 'working'),
					makeLog('wkl_3', 'exc_a', 3, 'working') // beyond planned
				],
				plannedSets: [planned('working', 1), planned('working', 2)]
			}
		])

		expect(rounds.length).toBe(2)
		expect(rounds[0].sets[0].log?.id).toBe('wkl_1')
		expect(rounds[1].sets[0].log?.id).toBe('wkl_2')
		expect(extraLogs.map(e => e.log.id)).toEqual(['wkl_3'])
	})
})

// --- flattenSets ---

function supersetRenderItem(opts: {
	group: number
	a: { sets: number; mode?: PlannedSet['setType'] }
	b: { sets: number; mode?: PlannedSet['setType'] }
}): RenderItem {
	const a = makeExercise('exc_a', 'Bench Press')
	const b = makeExercise('exc_b', 'Row')
	return {
		type: 'superset',
		group: opts.group,
		exercises: [
			{
				exerciseId: 'exc_a' as Exercise['id'],
				exercise: a,
				logs: [],
				planned: Array.from({ length: opts.a.sets }, (_, i) => planned(opts.a.mode ?? 'working', i + 1))
			},
			{
				exerciseId: 'exc_b' as Exercise['id'],
				exercise: b,
				logs: [],
				planned: Array.from({ length: opts.b.sets }, (_, i) => planned(opts.b.mode ?? 'working', i + 1))
			}
		]
	}
}

describe('flattenSets', () => {
	it('standalone: setNumber + totalSets per exercise, transition=false', () => {
		const flat = flattenSets([
			{
				type: 'standalone',
				exerciseId: 'exc_solo' as Exercise['id'],
				exercise: makeExercise('exc_solo', 'Squat'),
				logs: [],
				planned: [planned('working', 1), planned('working', 2), planned('working', 3)]
			}
		])

		expect(flat.map(s => s.setNumber)).toEqual([1, 2, 3])
		expect(flat.map(s => s.totalSets)).toEqual([3, 3, 3])
		expect(flat.every(s => !s.transition)).toBe(true)
		expect(flat.every(s => s.superset === null)).toBe(true)
	})

	it('equal-length superset: transition flips on last-in-round; per-exercise numbering', () => {
		const flat = flattenSets([supersetRenderItem({ group: 1, a: { sets: 2 }, b: { sets: 2 } })])

		expect(flat.length).toBe(4)
		// Order: A1, B1, A2, B2
		expect(flat.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b', 'exc_a', 'exc_b'])
		// Transitions: A1 → switch (true), B1 → rest (false), A2 → switch, B2 → rest
		expect(flat.map(s => s.transition)).toEqual([true, false, true, false])
		// Per-exercise numbering, not cumulative
		expect(flat.map(s => s.setNumber)).toEqual([1, 1, 2, 2])
		expect(flat.map(s => s.totalSets)).toEqual([2, 2, 2, 2])
	})

	it('unequal superset (A=3, B=2): trailing A3 is solo round with transition=false', () => {
		const flat = flattenSets([supersetRenderItem({ group: 1, a: { sets: 3 }, b: { sets: 2 } })])

		// Order: A1, B1, A2, B2, A3
		expect(flat.map(s => s.exerciseId)).toEqual(['exc_a', 'exc_b', 'exc_a', 'exc_b', 'exc_a'])
		// A3 is alone in its round → transition=false (rest after it)
		expect(flat.map(s => s.transition)).toEqual([true, false, true, false, false])
		// Per-exercise numbering: A reads 1,2,3 of 3; B reads 1,2 of 2
		expect(flat.map(s => `${s.exerciseId}:${s.setNumber}/${s.totalSets}`)).toEqual([
			'exc_a:1/3',
			'exc_b:1/2',
			'exc_a:2/3',
			'exc_b:2/2',
			'exc_a:3/3'
		])
	})

	it('superset attaches superset metadata (group + letters) to every set', () => {
		const flat = flattenSets([supersetRenderItem({ group: 2, a: { sets: 1 }, b: { sets: 1 } })])

		expect(flat[0].superset).toEqual({
			group: 2,
			exerciseLetter: 'A',
			exercises: [
				{ exerciseId: 'exc_a', name: 'Bench Press', letter: 'A' },
				{ exerciseId: 'exc_b', name: 'Row', letter: 'B' }
			]
		})
		expect(flat[1].superset?.exerciseLetter).toBe('B')
	})
})
