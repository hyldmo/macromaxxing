import { useMemo } from 'react'
import {
	type AbsoluteMacros,
	calculateIngredientMacros,
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from '../utils/macros'

interface RecipeIngredient {
	amountGrams: number
	ingredient: {
		protein: number
		carbs: number
		fat: number
		kcal: number
		fiber: number
	}
}

interface RecipeData {
	cookedWeight: number | null
	portionSize: number
	recipeIngredients: RecipeIngredient[]
}

interface RecipeCalculations {
	ingredientMacros: AbsoluteMacros[]
	totals: AbsoluteMacros
	cookedWeight: number
	portion: AbsoluteMacros
}

export function useRecipeCalculations(recipe: RecipeData | undefined): RecipeCalculations | null {
	return useMemo(() => {
		if (!recipe) return null

		const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
			per100g: ri.ingredient,
			amountGrams: ri.amountGrams
		}))

		const ingredientMacros = items.map(item => calculateIngredientMacros(item.per100g, item.amountGrams))
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
		const portion = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)

		return { ingredientMacros, totals, cookedWeight, portion }
	}, [recipe])
}
