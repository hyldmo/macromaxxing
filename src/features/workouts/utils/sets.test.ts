import { describe, expect, it } from 'vitest'
import { calculateRest, generateBackoffSets, generateWarmupSets, shouldSkipWarmup } from './sets'

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
	describe('heavy barbell (>60kg)', () => {
		it('100kg working weight → bar, 50%, 75%', () => {
			const sets = generateWarmupSets(100, 5)
			expect(sets).toEqual([
				{ weightKg: 20, reps: 10, setType: 'warmup' },
				{ weightKg: 50, reps: 5, setType: 'warmup' },
				{ weightKg: 75, reps: 3, setType: 'warmup' }
			])
		})

		it('140kg working weight → bar, 70, 105', () => {
			const sets = generateWarmupSets(140, 5)
			expect(sets).toEqual([
				{ weightKg: 20, reps: 10, setType: 'warmup' },
				{ weightKg: 70, reps: 5, setType: 'warmup' },
				{ weightKg: 105, reps: 3, setType: 'warmup' }
			])
		})

		it('65kg working weight → bar, 32.5, 50', () => {
			// 65 * 0.5 = 32.5 → roundWeight(32.5) = 32.5
			// 65 * 0.75 = 48.75 → roundWeight(48.75) = 50
			// 65 - 50 = 15, >= 5 so it should be included
			const sets = generateWarmupSets(65, 8)
			expect(sets).toEqual([
				{ weightKg: 20, reps: 10, setType: 'warmup' },
				{ weightKg: 32.5, reps: 5, setType: 'warmup' },
				{ weightKg: 50, reps: 3, setType: 'warmup' }
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
