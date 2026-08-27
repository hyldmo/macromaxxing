import { describe, expect, it } from 'vitest'
import { calculateLabelMacrosPer100g } from './macros'

describe('calculateLabelMacrosPer100g', () => {
	it('rounds gram values to 0.1 g and calories to a whole number', () => {
		expect(calculateLabelMacrosPer100g({ protein: 3.9, carbs: 37, fat: 17, kcal: 328, fiber: 6.3 }, 135)).toEqual({
			protein: 2.9,
			carbs: 27.4,
			fat: 12.6,
			kcal: 243,
			fiber: 4.7
		})
	})
})
