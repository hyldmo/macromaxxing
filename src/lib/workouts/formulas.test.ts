import { describe, expect, it } from 'vitest'
import {
	computeDivergences,
	estimated1RM,
	isE1rmPR,
	isStalledExercise,
	metricHierarchy,
	roundWeight,
	weightForReps
} from './formulas'

describe('estimated1RM', () => {
	// Brzycki: weight × 36 / (37 − reps), capped at 12 reps

	describe('low rep range (1-10)', () => {
		it('1 rep → returns the weight itself', () => {
			// 100 × 36 / (37 − 1) = 100
			expect(estimated1RM(100, 1)).toBe(100)
		})

		it('5 reps at 100kg → 112.5kg', () => {
			// 100 × 36 / (37 − 5) = 100 × 36 / 32 = 112.5
			expect(estimated1RM(100, 5)).toBe(112.5)
		})

		it('10 reps at 100kg → ~133.3kg', () => {
			// 100 × 36 / (37 − 10) = 100 × 36 / 27 ≈ 133.33
			expect(estimated1RM(100, 10)).toBeCloseTo(133.33, 1)
		})
	})

	describe('rep cap prevents inflated estimates', () => {
		it('12 reps hits the cap exactly', () => {
			// 100 × 36 / (37 − 12) = 100 × 36 / 25 = 144
			expect(estimated1RM(100, 12)).toBe(144)
		})

		it('15 reps returns same as 12 reps', () => {
			expect(estimated1RM(100, 15)).toBe(estimated1RM(100, 12))
		})

		it('27 reps at 25kg → 36kg (not 90kg)', () => {
			// Without cap: 25 × 36 / (37 − 27) = 25 × 3.6 = 90 (absurd)
			// With cap:    25 × 36 / (37 − 12) = 25 × 1.44 = 36
			expect(estimated1RM(25, 27)).toBe(36)
		})

		it('36 reps returns same as 12 reps', () => {
			// Without cap this would approach infinity (37 − 36 = 1)
			expect(estimated1RM(100, 36)).toBe(estimated1RM(100, 12))
		})
	})

	describe('edge cases', () => {
		it('0 reps → returns weight unchanged', () => {
			expect(estimated1RM(100, 0)).toBe(100)
		})

		it('negative reps → returns weight unchanged', () => {
			expect(estimated1RM(100, -5)).toBe(100)
		})

		it('0 weight → 0', () => {
			expect(estimated1RM(0, 5)).toBe(0)
		})
	})
})

describe('weightForReps', () => {
	// Inverse Brzycki: 1RM × (37 − reps) / 36

	it('1 rep → returns full 1RM', () => {
		// 100 × (37 − 1) / 36 = 100
		expect(weightForReps(100, 1)).toBe(100)
	})

	it('5 reps at 112.5kg 1RM → ~88.9kg', () => {
		// 112.5 × (37 − 5) / 36 = 112.5 × 32/36 = 100
		expect(weightForReps(112.5, 5)).toBe(100)
	})

	it('round-trips with estimated1RM for low reps', () => {
		const weight = 80
		const reps = 8
		const e1rm = estimated1RM(weight, reps)
		expect(weightForReps(e1rm, reps)).toBeCloseTo(weight, 5)
	})

	describe('edge cases', () => {
		it('0 reps → returns 1RM', () => {
			expect(weightForReps(100, 0)).toBe(100)
		})

		it('37+ reps → returns 1RM (formula breaks down)', () => {
			expect(weightForReps(100, 37)).toBe(100)
			expect(weightForReps(100, 50)).toBe(100)
		})
	})
})

describe('roundWeight', () => {
	describe('kg increments', () => {
		it('heavy weight (>20kg) rounds to 2.5kg', () => {
			expect(roundWeight(81)).toBe(80)
			expect(roundWeight(82)).toBe(82.5)
		})

		it('medium weight (5-20kg) rounds to 1.25kg', () => {
			expect(roundWeight(14)).toBe(13.75)
			expect(roundWeight(15)).toBe(15)
		})

		it('light weight (≤5kg) rounds to 0.5kg', () => {
			expect(roundWeight(3.3)).toBe(3.5)
			expect(roundWeight(3.1)).toBe(3)
		})
	})

	describe('direction', () => {
		it('up rounds toward higher weight', () => {
			expect(roundWeight(81, 'kg', 'up')).toBe(82.5)
		})

		it('down rounds toward lower weight', () => {
			expect(roundWeight(82, 'kg', 'down')).toBe(80)
		})

		it('nearest is default', () => {
			expect(roundWeight(81)).toBe(80)
			expect(roundWeight(82)).toBe(82.5)
		})
	})

	describe('lbs increments', () => {
		it('heavy (>40lbs) rounds to 5lbs', () => {
			expect(roundWeight(142, 'lbs')).toBe(140)
			expect(roundWeight(143, 'lbs')).toBe(145)
		})

		it('medium (10-40lbs) rounds to 2.5lbs', () => {
			expect(roundWeight(26, 'lbs')).toBe(25)
			expect(roundWeight(27, 'lbs')).toBe(27.5)
		})

		it('light (≤10lbs) rounds to 1lb', () => {
			expect(roundWeight(7.3, 'lbs')).toBe(7)
			expect(roundWeight(7.6, 'lbs')).toBe(8)
		})
	})
})

describe('isE1rmPR', () => {
	it('returns true when set e1RM exceeds prior max by > 0.5kg', () => {
		// estimated1RM(100, 5) = 112.5; 112.5 > 100 + 0.5
		expect(isE1rmPR({ weightKg: 100, reps: 5 }, 100)).toBe(true)
	})

	it('returns false when set e1RM exactly equals prior max', () => {
		const prior = estimated1RM(100, 5) // 112.5
		expect(isE1rmPR({ weightKg: 100, reps: 5 }, prior)).toBe(false)
	})

	it('returns false for marginal increase under 0.5kg tolerance', () => {
		const prior = estimated1RM(100, 5) // 112.5
		// 0.3kg above prior — under tolerance
		expect(isE1rmPR({ weightKg: 100, reps: 5 }, prior - 0.3)).toBe(false)
	})

	it('returns true once increase clears the 0.5kg tolerance', () => {
		const prior = estimated1RM(100, 5) // 112.5
		// 0.6kg above prior — over tolerance
		expect(isE1rmPR({ weightKg: 100, reps: 5 }, prior - 0.6)).toBe(true)
	})

	it('returns false for bodyweight set (weightKg = 0)', () => {
		expect(isE1rmPR({ weightKg: 0, reps: 10 }, 0)).toBe(false)
		expect(isE1rmPR({ weightKg: 0, reps: 10 }, 100)).toBe(false)
	})

	it('returns false for zero-rep set', () => {
		expect(isE1rmPR({ weightKg: 100, reps: 0 }, 50)).toBe(false)
	})

	it('returns false for negative weight or reps', () => {
		expect(isE1rmPR({ weightKg: -10, reps: 5 }, 0)).toBe(false)
		expect(isE1rmPR({ weightKg: 100, reps: -1 }, 0)).toBe(false)
	})

	it('does not flip on float-noise near-ties', () => {
		// Adversarial: prior max is the same e1RM perturbed by ~1e-10.
		// Without tolerance, this would oscillate true/false based on rounding.
		const e1rm = estimated1RM(100, 10) // 133.333…
		expect(isE1rmPR({ weightKg: 100, reps: 10 }, e1rm + 1e-10)).toBe(false)
		expect(isE1rmPR({ weightKg: 100, reps: 10 }, e1rm - 1e-10)).toBe(false)
	})
})

describe('isStalledExercise', () => {
	it('returns false with fewer than 3 sessions', () => {
		expect(isStalledExercise([])).toBe(false)
		expect(isStalledExercise([100])).toBe(false)
		expect(isStalledExercise([100, 101])).toBe(false)
	})

	it('returns true when last 3 sessions show <2.5% gain', () => {
		// (101 - 100) / 100 = 1% ≤ 2.5%
		expect(isStalledExercise([100, 100.5, 101])).toBe(true)
	})

	it('returns true on flat progression (0% gain)', () => {
		expect(isStalledExercise([100, 100, 100])).toBe(true)
	})

	it('returns true on regression (negative gain)', () => {
		expect(isStalledExercise([100, 99, 98])).toBe(true)
	})

	it('returns false when last 3 sessions show >=2.5% gain', () => {
		// (103 - 100) / 100 = 3% > 2.5%
		expect(isStalledExercise([100, 101.5, 103])).toBe(false)
	})

	it('returns false at exactly the threshold boundary (>2.5%)', () => {
		// Just above 2.5% threshold
		expect(isStalledExercise([100, 101, 102.6])).toBe(false)
	})

	it('returns false when first of last 3 is zero (bodyweight / invalid)', () => {
		expect(isStalledExercise([0, 0, 0])).toBe(false)
		// Window is the last 3 entries; here first-of-window is 0 → bail to caller's fallback
		expect(isStalledExercise([100, 0, 0, 0])).toBe(false)
	})

	it('returns false when first of last 3 is negative', () => {
		expect(isStalledExercise([-1, 5, 10])).toBe(false)
	})

	it('considers ONLY the last 3 entries even when more provided', () => {
		// First 7 entries show big growth, but last 3 are flat
		// Last 3 = [100, 100.5, 101] → 1% gain → stalled
		expect(isStalledExercise([10, 20, 30, 40, 50, 60, 70, 100, 100.5, 101])).toBe(true)

		// Inverse: first 7 flat, but last 3 show 5% gain → not stalled
		expect(isStalledExercise([100, 100, 100, 100, 100, 100, 100, 100, 102, 105])).toBe(false)
	})

	it('respects custom threshold', () => {
		// 3% gain — stalled at threshold=0.05, not stalled at threshold=0.025
		expect(isStalledExercise([100, 101.5, 103], 0.05)).toBe(true)
		expect(isStalledExercise([100, 101.5, 103], 0.025)).toBe(false)
	})
})

describe('metricHierarchy', () => {
	it('returns e1rm kind for normal weighted set', () => {
		const result = metricHierarchy({ weightKg: 100, reps: 5 })
		expect(result.kind).toBe('e1rm')
		expect(result.value).toBe(estimated1RM(100, 5))
	})

	it('e1rm value matches estimated1RM output exactly', () => {
		const result = metricHierarchy({ weightKg: 80, reps: 8 })
		expect(result).toEqual({ kind: 'e1rm', value: estimated1RM(80, 8) })
	})

	it('returns reps kind for bodyweight set (weightKg = 0, reps > 0)', () => {
		expect(metricHierarchy({ weightKg: 0, reps: 12 })).toEqual({ kind: 'reps', value: 12 })
	})

	it('returns recency kind for empty set (weightKg = 0, reps = 0)', () => {
		expect(metricHierarchy({ weightKg: 0, reps: 0 })).toEqual({ kind: 'recency', value: null })
	})

	it('returns recency kind when reps logged but weight is negative (invalid)', () => {
		expect(metricHierarchy({ weightKg: -5, reps: 5 })).toEqual({ kind: 'recency', value: null })
	})

	it('returns recency kind when weight set but reps zero', () => {
		expect(metricHierarchy({ weightKg: 100, reps: 0 })).toEqual({ kind: 'recency', value: null })
	})
})

describe('computeDivergences bodyweight', () => {
	const pullUpExercise = {
		exerciseId: 'exc_test_pullup' as const,
		exercise: {
			name: 'Pull-Up',
			type: 'compound' as const,
			bwMultiplier: 1,
			strengthRepsMin: 5,
			strengthRepsMax: 8,
			hypertrophyRepsMin: 8,
			hypertrophyRepsMax: 12
		},
		targetSets: 3,
		targetReps: 8,
		targetWeight: 20,
		setMode: 'working' as const,
		trainingGoal: null
	}

	it('does not flag false divergence when logged effective matches template added', () => {
		const divergences = computeDivergences(
			[
				{
					exerciseId: pullUpExercise.exerciseId,
					setType: 'working',
					weightKg: 100,
					reps: 8
				}
			],
			[pullUpExercise],
			'hypertrophy',
			80
		)
		expect(divergences).toEqual([])
	})

	it('suggests added kg when performance beats template', () => {
		const divergences = computeDivergences(
			[
				{
					exerciseId: pullUpExercise.exerciseId,
					setType: 'working',
					weightKg: 110,
					reps: 10
				}
			],
			[pullUpExercise],
			'hypertrophy',
			80
		)
		expect(divergences).toHaveLength(1)
		expect(divergences[0]?.actual.weight).toBe(30)
		expect(divergences[0]?.suggestion.targetWeight).toBe(30)
		expect(divergences[0]?.bwMultiplier).toBe(1)
	})
})
