import { formatIngredientAmount } from '~/features/recipes/utils/format'

/**
 * How a slot's amount reads back to the person who entered it.
 *
 * `mealPlanSlots.portions` is the number every macro path multiplies by, and on an `ingredient`
 * wrapper (which holds 100 g) it is hectograms. Two small eggs land there as `0.76`, which is a
 * true number and an unreadable one. `displayAmount` + `displayUnit` carry what was typed, so the
 * card can say `2 small` and move by whole eggs.
 */
export interface SlotAmount {
	displayAmount: number | null
	displayUnit: string | null
	/** Gram weight the slot's macros were priced at — `calculateSlotMacros(...).weight`. */
	weightGrams: number
}

/** Grams one unit of this amount is worth. A slot logged on a scale counts in grams. */
function unitGrams({ displayAmount, displayUnit, weightGrams }: SlotAmount): number {
	if (!(displayUnit && displayAmount)) return 1
	return weightGrams / displayAmount
}

/**
 * Below this, one unit is too fine to tap through singly — grams and millilitres, where a 100 g
 * portion would take a hundred taps. Read off what one unit weighs rather than a list of unit
 * names, so an ingredient's own `scoop` or `medium` steps by one without being enumerated here.
 */
const COUNTABLE_UNIT_GRAMS = 2

/** How much one tap of the stepper moves the amount, and the smallest amount it can hold. */
export function slotAmountStep(slot: SlotAmount): number {
	return unitGrams(slot) >= COUNTABLE_UNIT_GRAMS ? 1 : 10
}

/** The number the stepper edits: the amount as entered, or grams for a slot weighed on a scale. */
export function slotAmountValue({ displayAmount, displayUnit, weightGrams }: SlotAmount): number {
	return displayUnit && displayAmount ? displayAmount : Math.round(weightGrams)
}

/** `2 small`, `½ pcs`, or `76 g` for anything logged before the unit was kept. */
export function formatSlotAmount(slot: SlotAmount): string {
	const { displayAmount, displayUnit } = slot
	if (displayUnit && displayAmount) return formatIngredientAmount(displayAmount, displayUnit)
	return formatIngredientAmount(slotAmountValue(slot), 'g')
}
