import type { AbsoluteMacros } from './types'

export interface MacrosPer100g {
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
}

export interface IngredientWithAmount {
	per100g: MacrosPer100g
	amountGrams: number
}

/**
 * Cut stored per-100 g values back to label precision: 0.1 g per macro, whole calories.
 * A packet prints no more than that, so a longer number is arithmetic left over from a
 * division — Open Food Facts derives per-100 g energy that way and hands back
 * `68.8372093023256`, which every macro surface then has to hide.
 */
export function roundMacrosPer100g(macros: MacrosPer100g): MacrosPer100g {
	const round = (value: number, decimalPlaces: number) => {
		const scale = 10 ** decimalPlaces
		return Math.round((value + Number.EPSILON) * scale) / scale
	}

	return {
		protein: round(macros.protein, 1),
		carbs: round(macros.carbs, 1),
		fat: round(macros.fat, 1),
		kcal: round(macros.kcal, 0),
		fiber: round(macros.fiber, 1)
	}
}

/** Convert label values for one serving into stored per-100 g values. */
export function calculateLabelMacrosPer100g(labelMacros: MacrosPer100g, servingSize: number): MacrosPer100g {
	const per100g = (value: number) => (value / servingSize) * 100

	return roundMacrosPer100g({
		protein: per100g(labelMacros.protein),
		carbs: per100g(labelMacros.carbs),
		fat: per100g(labelMacros.fat),
		kcal: per100g(labelMacros.kcal),
		fiber: per100g(labelMacros.fiber)
	})
}

export function calculateIngredientMacros(per100g: MacrosPer100g, amountGrams: number): AbsoluteMacros {
	const factor = amountGrams / 100
	return {
		protein: per100g.protein * factor,
		carbs: per100g.carbs * factor,
		fat: per100g.fat * factor,
		kcal: per100g.kcal * factor,
		fiber: per100g.fiber * factor,
		weight: amountGrams
	}
}

export function calculateRecipeTotals(ingredients: IngredientWithAmount[]): AbsoluteMacros {
	return ingredients.reduce(
		(acc, ing) => {
			const macros = calculateIngredientMacros(ing.per100g, ing.amountGrams)
			return {
				protein: acc.protein + macros.protein,
				carbs: acc.carbs + macros.carbs,
				fat: acc.fat + macros.fat,
				kcal: acc.kcal + macros.kcal,
				fiber: acc.fiber + macros.fiber,
				weight: acc.weight + macros.weight
			}
		},
		{ protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0, weight: 0 }
	)
}

/**
 * Subtract rendered fat that stayed in the pan: the grams come off fat and weight, the calories at
 * 9 kcal/g. Cooking conserves every other macro, so this is the only per-macro loss modelled.
 */
export function applyDiscardedFat(totals: AbsoluteMacros, discardedFat: number | null): AbsoluteMacros {
	if (!discardedFat) return totals
	return {
		...totals,
		fat: Math.max(0, totals.fat - discardedFat),
		kcal: Math.max(0, totals.kcal - discardedFat * 9),
		weight: Math.max(0, totals.weight - discardedFat)
	}
}

export function getEffectiveCookedWeight(rawTotal: number, cookedWeight: number | null): number {
	return cookedWeight ?? rawTotal
}

export function getEffectivePortionSize(cookedWeight: number, portionSize: number | null): number {
	return portionSize ?? cookedWeight
}

export function calculatePortionMacros(
	totalMacros: AbsoluteMacros,
	cookedWeight: number,
	portionSize: number | null
): AbsoluteMacros {
	if (cookedWeight === 0) return { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0, weight: 0 }
	// null portionSize = entire dish is 1 portion
	const effectivePortionSize = getEffectivePortionSize(cookedWeight, portionSize)
	const factor = effectivePortionSize / cookedWeight
	return {
		protein: totalMacros.protein * factor,
		carbs: totalMacros.carbs * factor,
		fat: totalMacros.fat * factor,
		kcal: totalMacros.kcal * factor,
		fiber: totalMacros.fiber * factor,
		weight: effectivePortionSize
	}
}

export interface RecipeMacroSource {
	recipeIngredients: Parameters<typeof toIngredientWithAmount>[0][]
	cookedWeight: number | null
	discardedFat: number | null
	portionSize: number | null
}

export interface RecipeMacros {
	/** Raw ingredient sum — what went into the pan */
	totals: AbsoluteMacros
	/** Totals minus discarded fat — what gets eaten */
	consumed: AbsoluteMacros
	cookedWeight: number
	portionSize: number
	portion: AbsoluteMacros
}

/**
 * The one chain from a recipe row to priced macros. Every surface that shows what a portion costs
 * goes through here, so the discarded-fat deduction cannot be skipped on one of them. Grocery
 * amounts stay on `calculateRecipeTotals` — shopping needs the raw grams.
 */
export function calculateRecipeMacros(recipe: RecipeMacroSource): RecipeMacros {
	const items = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const consumed = applyDiscardedFat(totals, recipe.discardedFat)
	const cookedWeight = getEffectiveCookedWeight(consumed.weight, recipe.cookedWeight)
	const portionSize = getEffectivePortionSize(cookedWeight, recipe.portionSize)
	const portion = calculatePortionMacros(consumed, cookedWeight, recipe.portionSize)
	return { totals, consumed, cookedWeight, portionSize, portion }
}

export function macroPercentage(macroGrams: number, totalWeight: number): number {
	if (totalWeight === 0) return 0
	return (macroGrams / totalWeight) * 100
}

export interface CaloricRatio {
	protein: number
	carbs: number
	fat: number
	total: number
}

export function caloricRatio({ protein, carbs, fat }: Pick<AbsoluteMacros, 'protein' | 'carbs' | 'fat'>): CaloricRatio {
	const pCal = protein * 4
	const cCal = carbs * 4
	const fCal = fat * 9
	const total = pCal + cCal + fCal
	if (total === 0) return { protein: 0, carbs: 0, fat: 0, total: 0 }
	return { protein: pCal / total, carbs: cCal / total, fat: fCal / total, total }
}

export interface MacroRatio extends CaloricRatio {
	fiber: number
}

export function macroRatio(macros: Pick<AbsoluteMacros, 'protein' | 'carbs' | 'fat' | 'fiber'>): MacroRatio {
	const { protein, carbs, fat, fiber } = macros
	const total = protein + carbs + fat + fiber
	if (total === 0) return { protein: 0, carbs: 0, fat: 0, fiber: 0, total: 0 }
	return { protein: protein / total, carbs: carbs / total, fat: fat / total, fiber: fiber / total, total }
}

// Calculate macros for allocated portions in a meal slot
export function calculateSlotMacros(recipePortionMacros: AbsoluteMacros, allocatedPortions: number): AbsoluteMacros {
	return {
		protein: recipePortionMacros.protein * allocatedPortions,
		carbs: recipePortionMacros.carbs * allocatedPortions,
		fat: recipePortionMacros.fat * allocatedPortions,
		kcal: recipePortionMacros.kcal * allocatedPortions,
		fiber: recipePortionMacros.fiber * allocatedPortions,
		weight: recipePortionMacros.weight * allocatedPortions
	}
}

// Sum all slots for a day
export function calculateDayTotals(slots: AbsoluteMacros[]): AbsoluteMacros {
	return slots.reduce(
		(acc, slot) => ({
			protein: acc.protein + slot.protein,
			carbs: acc.carbs + slot.carbs,
			fat: acc.fat + slot.fat,
			kcal: acc.kcal + slot.kcal,
			fiber: acc.fiber + slot.fiber,
			weight: acc.weight + slot.weight
		}),
		{ protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0, weight: 0 }
	)
}

// Average across filled days (days with at least one meal)
export function calculateWeeklyAverage(dayTotals: AbsoluteMacros[]): AbsoluteMacros {
	const filledDays = dayTotals.filter(d => d.kcal > 0)
	if (filledDays.length === 0) {
		return { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0, weight: 0 }
	}
	const sum = calculateDayTotals(filledDays)
	return {
		protein: sum.protein / filledDays.length,
		carbs: sum.carbs / filledDays.length,
		fat: sum.fat / filledDays.length,
		kcal: sum.kcal / filledDays.length,
		fiber: sum.fiber / filledDays.length,
		weight: sum.weight / filledDays.length
	}
}

// Calculate per-100g macros for a subrecipe based on its ingredients and cooked weight
export function calculateSubrecipePer100g(subrecipe: {
	recipeIngredients: Array<{ ingredient: MacrosPer100g | null; amountGrams: number }>
	cookedWeight: number | null
	discardedFat: number | null
}): MacrosPer100g {
	const items: IngredientWithAmount[] = subrecipe.recipeIngredients
		.filter(ri => ri.ingredient != null)
		.map(ri => ({ per100g: ri.ingredient!, amountGrams: ri.amountGrams }))
	const totals = applyDiscardedFat(calculateRecipeTotals(items), subrecipe.discardedFat)
	const effectiveWeight = subrecipe.cookedWeight ?? totals.weight
	if (effectiveWeight === 0) return { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0 }
	return {
		protein: (totals.protein / effectiveWeight) * 100,
		carbs: (totals.carbs / effectiveWeight) * 100,
		fat: (totals.fat / effectiveWeight) * 100,
		kcal: (totals.kcal / effectiveWeight) * 100,
		fiber: (totals.fiber / effectiveWeight) * 100
	}
}

// Map a recipe ingredient (with possible subrecipe) to IngredientWithAmount
export function toIngredientWithAmount(ri: {
	ingredient: MacrosPer100g | null
	subrecipe: {
		recipeIngredients: Array<{ ingredient: MacrosPer100g | null; amountGrams: number }>
		cookedWeight: number | null
		discardedFat: number | null
	} | null
	amountGrams: number
}): IngredientWithAmount {
	return {
		per100g: ri.subrecipe
			? calculateSubrecipePer100g(ri.subrecipe)
			: (ri.ingredient ?? { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0 }),
		amountGrams: ri.amountGrams
	}
}

// Calculate remaining portions for inventory display
export function calculateRemainingPortions(totalPortions: number, allocatedSlots: { portions: number }[]): number {
	const used = allocatedSlots.reduce((sum, slot) => sum + slot.portions, 0)
	return totalPortions - used
}
