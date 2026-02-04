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

export interface AbsoluteMacros {
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
	weight: number
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

export function calculatePortionMacros(
	totalMacros: AbsoluteMacros,
	cookedWeight: number,
	portionSize: number
): AbsoluteMacros {
	if (cookedWeight === 0) return { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0, weight: 0 }
	const factor = portionSize / cookedWeight
	return {
		protein: totalMacros.protein * factor,
		carbs: totalMacros.carbs * factor,
		fat: totalMacros.fat * factor,
		kcal: totalMacros.kcal * factor,
		fiber: totalMacros.fiber * factor,
		weight: portionSize
	}
}

export function macroPercentage(macroGrams: number, totalWeight: number): number {
	if (totalWeight === 0) return 0
	return (macroGrams / totalWeight) * 100
}
