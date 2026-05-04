import type { AbsoluteMacros } from '@macromaxxing/db'
import { useMemo } from 'react'
import type { RouterOutput } from '~/lib/trpc'
import {
	calculateIngredientMacros,
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	getEffectivePortionSize,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '../utils/macros'

type Recipe = RouterOutput['recipe']['get']

interface RecipeCalculations {
	ingredientMacros: AbsoluteMacros[]
	totals: AbsoluteMacros
	cookedWeight: number
	portionSize: number
	portion: AbsoluteMacros
}

export function useRecipeCalculations(recipe: Recipe | undefined): RecipeCalculations | null {
	return useMemo(() => {
		if (!recipe) return null

		const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)

		const ingredientMacros = items.map(item => calculateIngredientMacros(item.per100g, item.amountGrams))
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
		const portionSize = getEffectivePortionSize(cookedWeight, recipe.portionSize)
		const portion = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)

		return { ingredientMacros, totals, cookedWeight, portionSize, portion }
	}, [recipe])
}
