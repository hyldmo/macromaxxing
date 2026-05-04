import type { Ingredient } from '@macromaxxing/db'
import {
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	getEffectivePortionSize,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import type { RouterOutput } from '~/lib/trpc'

type MealPlan = RouterOutput['mealPlan']['get']
type InventoryItem = MealPlan['inventory'][number]
type RecipeIngredient = InventoryItem['recipe']['recipeIngredients'][number]

export interface GroceryItem {
	ingredient: NonNullable<RecipeIngredient['ingredient']>
	totalGrams: number
	/** Which recipes contribute to this ingredient */
	sources: Array<{ recipeName: string; grams: number }>
}

/**
 * Calculate how many batches of a recipe are needed for the given inventory portions.
 * One batch = all ingredient amounts as written. The number of portions one batch yields
 * depends on cookedWeight and portionSize.
 */
function batchesForInventory(inv: InventoryItem): number {
	const recipe = inv.recipe
	const items = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	const portionSize = getEffectivePortionSize(cookedWeight, recipe.portionSize)
	if (portionSize === 0) return 0
	const portionsPerBatch = cookedWeight / portionSize
	if (portionsPerBatch === 0) return 0
	return inv.totalPortions / portionsPerBatch
}

/**
 * Flatten a recipe ingredient into base ingredients with their gram amounts.
 * Handles both direct ingredients and subrecipes.
 */
function flattenRecipeIngredient(
	ri: RecipeIngredient
): Array<{ ingredient: NonNullable<RecipeIngredient['ingredient']>; grams: number }> {
	if (ri.ingredient) {
		return [{ ingredient: ri.ingredient, grams: ri.amountGrams }]
	}

	if (ri.subrecipe) {
		const subIngredients = ri.subrecipe.recipeIngredients
		const rawTotal = subIngredients.reduce((sum, si) => sum + si.amountGrams, 0)
		const effectiveWeight = ri.subrecipe.cookedWeight ?? rawTotal
		if (effectiveWeight === 0) return []

		// ri.amountGrams = grams of the cooked subrecipe product used
		// Scale each sub-ingredient by the fraction of the subrecipe used
		const fraction = ri.amountGrams / effectiveWeight
		return subIngredients
			.filter((si): si is typeof si & { ingredient: Ingredient } => si.ingredient != null)
			.map(si => ({
				ingredient: si.ingredient,
				grams: si.amountGrams * fraction
			}))
	}

	return []
}

/**
 * Generate a grocery list from a meal plan by aggregating all ingredients
 * across inventory items, scaled by totalPortions.
 */
export function generateGroceryList(plan: MealPlan): GroceryItem[] {
	const map = new Map<Ingredient['id'], GroceryItem>()

	for (const inv of plan.inventory) {
		const batches = batchesForInventory(inv)
		if (batches === 0) continue

		for (const ri of inv.recipe.recipeIngredients) {
			const flat = flattenRecipeIngredient(ri)

			for (const { ingredient, grams } of flat) {
				const scaledGrams = grams * batches
				const existing = map.get(ingredient.id)

				if (existing) {
					existing.totalGrams += scaledGrams
					const source = existing.sources.find(s => s.recipeName === inv.recipe.name)
					if (source) {
						source.grams += scaledGrams
					} else {
						existing.sources.push({ recipeName: inv.recipe.name, grams: scaledGrams })
					}
				} else {
					map.set(ingredient.id, {
						ingredient,
						totalGrams: scaledGrams,
						sources: [{ recipeName: inv.recipe.name, grams: scaledGrams }]
					})
				}
			}
		}
	}

	return Array.from(map.values()).sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
}

/** Format a grocery list as plain text for copying */
export function formatGroceryList(items: GroceryItem[]): string {
	if (items.length === 0) return 'No ingredients in this meal plan.'

	return items
		.map(item => {
			const grams = Math.round(item.totalGrams)
			return `${item.ingredient.name} — ${grams}g`
		})
		.join('\n')
}
