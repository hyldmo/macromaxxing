import type { AbsoluteMacros } from '@macromaxxing/db'

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

export function macroPercentage(macroGrams: number, totalWeight: number): number {
	if (totalWeight === 0) return 0
	return (macroGrams / totalWeight) * 100
}

export interface CaloricRatio {
	protein: number
	carbs: number
	fat: number
}

export function caloricRatio(protein: number, carbs: number, fat: number): CaloricRatio {
	const pCal = protein * 4
	const cCal = carbs * 4
	const fCal = fat * 9
	const total = pCal + cCal + fCal
	if (total === 0) return { protein: 0, carbs: 0, fat: 0 }
	return { protein: pCal / total, carbs: cCal / total, fat: fCal / total }
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
}): MacrosPer100g {
	const items: IngredientWithAmount[] = subrecipe.recipeIngredients
		.filter(ri => ri.ingredient != null)
		.map(ri => ({ per100g: ri.ingredient!, amountGrams: ri.amountGrams }))
	const totals = calculateRecipeTotals(items)
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
