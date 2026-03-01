import { describe, expect, it } from 'vitest'
import { estimated1RM, roundWeight, weightForReps } from './formulas'

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
