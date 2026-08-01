import { resolveUnitGrams } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight
} from '~/features/recipes/utils/macros'

/**
 * `mealPlan.logMeal` puts a bare ingredient in a plan by wrapping it in a `type: 'ingredient'` recipe
 * holding 100 g, with `portionSize: 100` and no cooked weight, then storing the amount as the slot's
 * portions (`grams / 100`). Nothing downstream knows about that encoding — every macro surface just
 * runs the normal recipe path — so these assert the round trip actually reproduces the grams logged.
 */
const PORTION_GRAMS = 100

/** Chicken breast, per 100 g. */
const PER_100G = { protein: 31, carbs: 0, fat: 3.6, kcal: 165, fiber: 0 }

function wrapperPortionMacros() {
	const totals = calculateRecipeTotals([{ per100g: PER_100G, amountGrams: PORTION_GRAMS }])
	// The wrapper carries no cooked weight, so it falls back to the raw 100 g it holds.
	const cookedWeight = getEffectiveCookedWeight(totals.weight, null)
	return calculatePortionMacros(totals, cookedWeight, PORTION_GRAMS)
}

describe('ingredient wrapper recipe', () => {
	it('prices one portion as exactly 100 g of the ingredient', () => {
		const portion = wrapperPortionMacros()

		expect(portion.weight).toBe(100)
		expect(portion.protein).toBeCloseTo(31)
		expect(portion.kcal).toBeCloseTo(165)
	})

	it.each([
		[200, 2],
		[150, 1.5],
		[75, 0.75],
		[30, 0.3]
	])('logs %ig as %s portions and recovers the original macros', (grams, portions) => {
		expect(grams / PORTION_GRAMS).toBe(portions)

		const slot = calculateSlotMacros(wrapperPortionMacros(), portions)

		expect(slot.weight).toBeCloseTo(grams)
		expect(slot.protein).toBeCloseTo((PER_100G.protein * grams) / 100)
		expect(slot.kcal).toBeCloseTo((PER_100G.kcal * grams) / 100)
	})
})

/** Avocado, per 100 g of flesh — and a `pcs` that is the flesh too, not the whole fruit. */
const AVOCADO_PER_100G = { protein: 2, carbs: 8.5, fat: 14.7, kcal: 160, fiber: 6.7 }
const AVOCADO_UNITS = [
	{ name: 'g', grams: 1 },
	{ name: 'pcs', grams: 140 }
]

describe('logging a piece unit', () => {
	it('prices half an avocado off the edible weight, not the market weight', () => {
		const gramsPerPiece = resolveUnitGrams('pcs', AVOCADO_UNITS, null)
		const grams = (gramsPerPiece ?? 0) * 0.5
		expect(grams).toBe(70)

		const totals = calculateRecipeTotals([{ per100g: AVOCADO_PER_100G, amountGrams: PORTION_GRAMS }])
		const portion = calculatePortionMacros(totals, getEffectiveCookedWeight(totals.weight, null), PORTION_GRAMS)
		const slot = calculateSlotMacros(portion, grams / PORTION_GRAMS)

		expect(slot.weight).toBeCloseTo(70)
		expect(slot.kcal).toBeCloseTo(112)
		// Logging the ~201 g whole fruit instead would bill 322 kcal for the same half avocado.
		expect(slot.kcal).toBeLessThan((AVOCADO_PER_100G.kcal * 201 * 0.5) / 100)
	})
})
