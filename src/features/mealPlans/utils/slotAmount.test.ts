import { describe, expect, it } from 'vitest'
import { formatSlotAmount, type SlotAmount, slotAmountStep, slotAmountValue } from './slotAmount'

/** Two small eggs: 38 g each, so `mealPlan.logMeal` stores 0.76 portions of a 100 g wrapper. */
const TWO_SMALL_EGGS: SlotAmount = { displayAmount: 2, displayUnit: 'small', weightGrams: 76 }

/** 150 g of oats off a scale — logged with `grams`, so no unit was ever entered. */
const WEIGHED: SlotAmount = { displayAmount: null, displayUnit: null, weightGrams: 150 }

describe('formatSlotAmount', () => {
	it('reads back the unit that was entered, not the hectograms it resolved to', () => {
		expect(formatSlotAmount(TWO_SMALL_EGGS)).toBe('2 small')
	})

	it('falls back to grams for a slot logged by weight', () => {
		expect(formatSlotAmount(WEIGHED)).toBe('150 g')
	})

	it('renders a part-unit as a fraction', () => {
		expect(formatSlotAmount({ displayAmount: 0.5, displayUnit: 'medium', weightGrams: 30 })).toBe('½ medium')
	})
})

describe('slotAmountStep', () => {
	it('moves by one of anything countable', () => {
		expect(slotAmountStep(TWO_SMALL_EGGS)).toBe(1)
		// A tbsp of olive oil is ~13.8 g.
		expect(slotAmountStep({ displayAmount: 2, displayUnit: 'tbsp', weightGrams: 27.6 })).toBe(1)
	})

	it('moves by ten when the unit is a weight or a volume', () => {
		expect(slotAmountStep(WEIGHED)).toBe(10)
		expect(slotAmountStep({ displayAmount: 200, displayUnit: 'ml', weightGrams: 206 })).toBe(10)
	})

	it('steps down to one egg rather than stopping half an egg short', () => {
		const step = slotAmountStep(TWO_SMALL_EGGS)
		const next = slotAmountValue(TWO_SMALL_EGGS) - step

		expect(next).toBe(1)
		expect(next).toBeGreaterThanOrEqual(step)
	})
})

describe('slotAmountValue', () => {
	it('edits the entered amount, so a tap means one egg and not 50 g', () => {
		expect(slotAmountValue(TWO_SMALL_EGGS)).toBe(2)
	})

	it('edits whole grams when nothing else was entered', () => {
		expect(slotAmountValue({ displayAmount: null, displayUnit: null, weightGrams: 76.4 })).toBe(76)
	})
})
