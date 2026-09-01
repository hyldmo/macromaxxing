import { describe, expect, it } from 'vitest'
import {
	applyDiscardedFat,
	calculateLabelMacrosPer100g,
	calculateRecipeMacros,
	calculateSubrecipePer100g,
	roundMacrosPer100g
} from './macros'

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

describe('applyDiscardedFat', () => {
	const totals = { protein: 86, carbs: 67, fat: 78, kcal: 1330, fiber: 10, weight: 558 }

	it('subtracts the grams from fat and weight, and 9 kcal per gram', () => {
		expect(applyDiscardedFat(totals, 20)).toEqual({
			protein: 86,
			carbs: 67,
			fat: 58,
			kcal: 1150,
			fiber: 10,
			weight: 538
		})
	})

	it('passes totals through untouched when nothing was discarded', () => {
		expect(applyDiscardedFat(totals, null)).toBe(totals)
		expect(applyDiscardedFat(totals, 0)).toBe(totals)
	})

	it('clamps at zero when the discard exceeds the recipe', () => {
		const lean = { protein: 10, carbs: 0, fat: 5, kcal: 85, fiber: 0, weight: 50 }
		const result = applyDiscardedFat(lean, 60)
		expect(result.fat).toBe(0)
		expect(result.kcal).toBe(0)
		expect(result.weight).toBe(0)
	})
})

describe('calculateRecipeMacros', () => {
	// 200 g of a 50% fat ingredient: 100 g fat, 900 kcal raw
	const fattyRow = {
		ingredient: { protein: 0, carbs: 0, fat: 50, kcal: 450, fiber: 0 },
		subrecipe: null,
		amountGrams: 200
	}

	it('prices the portion off consumed totals, not raw', () => {
		const { totals, consumed, cookedWeight, portion } = calculateRecipeMacros({
			recipeIngredients: [fattyRow],
			cookedWeight: null,
			discardedFat: 20,
			portionSize: 90
		})
		expect(totals.fat).toBe(100)
		expect(consumed.fat).toBe(80)
		expect(consumed.kcal).toBe(720)
		// no measured cooked weight → the fat that left the pan leaves the default too
		expect(cookedWeight).toBe(180)
		// 90 g portion = half the dish
		expect(portion.fat).toBe(40)
		expect(portion.kcal).toBe(360)
	})

	it('keeps a measured cooked weight as-is — the pan fat is already off the scale', () => {
		const { cookedWeight, portion } = calculateRecipeMacros({
			recipeIngredients: [fattyRow],
			cookedWeight: 160,
			discardedFat: 20,
			portionSize: 80
		})
		expect(cookedWeight).toBe(160)
		expect(portion.fat).toBe(40)
	})
})

describe('calculateSubrecipePer100g', () => {
	it('subtracts the subrecipe’s own discarded fat before deriving per-100g', () => {
		const per100g = calculateSubrecipePer100g({
			recipeIngredients: [
				{ ingredient: { protein: 0, carbs: 0, fat: 50, kcal: 450, fiber: 0 }, amountGrams: 200 }
			],
			cookedWeight: null,
			discardedFat: 20
		})
		// 80 g fat / 720 kcal over 180 g
		expect(per100g.fat).toBeCloseTo(44.4, 1)
		expect(per100g.kcal).toBeCloseTo(400, 0)
	})
})

describe('roundMacrosPer100g', () => {
	it('cuts a per-100g energy Open Food Facts derived by division back to whole calories', () => {
		expect(
			roundMacrosPer100g({
				protein: 9.30232558139535,
				carbs: 3.7,
				fat: 1.8,
				kcal: 68.8372093023256,
				fiber: 0
			})
		).toEqual({ protein: 9.3, carbs: 3.7, fat: 1.8, kcal: 69, fiber: 0 })
	})
})
