import type { AbsoluteMacros, RecipeMacros } from '@macromaxxing/db'
import { useMemo } from 'react'
import type { RouterOutput } from '~/lib/trpc'
import { calculateIngredientMacros, calculateRecipeMacros, toIngredientWithAmount } from '../utils/macros'

type Recipe = RouterOutput['recipe']['get']

interface RecipeCalculations extends RecipeMacros {
	ingredientMacros: AbsoluteMacros[]
}

export function useRecipeCalculations(recipe: Recipe | undefined): RecipeCalculations | null {
	return useMemo(() => {
		if (!recipe) return null

		const items = recipe.recipeIngredients.map(toIngredientWithAmount)
		const ingredientMacros = items.map(item => calculateIngredientMacros(item.per100g, item.amountGrams))

		return { ingredientMacros, ...calculateRecipeMacros(recipe) }
	}, [recipe])
}
