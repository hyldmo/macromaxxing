import type { Ingredient, IngredientUnit, MealPlanInventory, Recipe, RecipeIngredient } from '@macromaxxing/db'

/**
 * One portion of a bare-ingredient inventory row.
 *
 * Ingredient macros are per 100 g, so a 100 g portion makes a slot's `portions` read as hectograms
 * and keeps the arithmetic identity. It is the same number the old `type: 'ingredient'` wrapper
 * recipe stored in `portionSize`, which is why the migration could leave those slots alone.
 */
export const INGREDIENT_PORTION_GRAMS = 100

/** A recipe's own rows carry ids; a projected ingredient's do not. */
type TargetIngredientRow = Omit<RecipeIngredient, 'id' | 'recipeId'> & {
	id: RecipeIngredient['id'] | null
	recipeId: Recipe['id'] | null
}

type LoadedRecipe = Recipe & {
	recipeIngredients: (RecipeIngredient & {
		ingredient: Ingredient | null
		subrecipe: (Recipe & { recipeIngredients: (RecipeIngredient & { ingredient: Ingredient | null })[] }) | null
	})[]
}

type LoadedIngredient = Ingredient & { units?: IngredientUnit[] }

/**
 * What a meal plan surface reads off an inventory row: a recipe, or a bare ingredient dressed as
 * one. `id` is null for the second, and `MealPlanInventory.ingredientId` says which it was.
 */
export type InventoryTarget = Omit<LoadedRecipe, 'id' | 'recipeIngredients'> & {
	id: Recipe['id'] | null
	recipeIngredients: (TargetIngredientRow & {
		ingredient: Ingredient | null
		subrecipe: LoadedRecipe['recipeIngredients'][number]['subrecipe']
	})[]
}

/**
 * Present a bare ingredient the way every meal plan consumer already reads a recipe: 100 g of
 * itself, one portion.
 *
 * This is deliberately a projection and not a row. A stored `type: 'ingredient'` recipe used to do
 * the same job, which cost a hidden duplicate of the ingredient in the recipes table, a
 * find-or-create on every log, and rows that no list surface would show. Computing it means macros,
 * the grocery list, the week calendar, and the export keep working on one shape while the database
 * holds no wrapper at all.
 */
export function ingredientAsTarget(ingredient: LoadedIngredient): InventoryTarget {
	return {
		id: null,
		userId: ingredient.userId,
		name: ingredient.name,
		instructions: null,
		cookedWeight: null,
		discardedFat: null,
		portionSize: INGREDIENT_PORTION_GRAMS,
		isPublic: false,
		sourceUrl: ingredient.sourceUrl,
		image: null,
		createdAt: ingredient.createdAt,
		updatedAt: ingredient.createdAt,
		recipeIngredients: [
			{
				id: null,
				recipeId: null,
				ingredientId: ingredient.id,
				subrecipeId: null,
				amountGrams: INGREDIENT_PORTION_GRAMS,
				displayUnit: null,
				displayAmount: null,
				preparation: null,
				sortOrder: 0,
				ingredient,
				subrecipe: null
			}
		]
	}
}

/**
 * Resolve one inventory row's target. The `recipeId`/`ingredientId` union is checked in SQL, so
 * exactly one lookup can hit; a miss means the row outlived what it pointed at.
 */
export function toInventoryItem<T extends MealPlanInventory>(
	inv: T,
	recipes: Map<Recipe['id'], LoadedRecipe>,
	ingredients: Map<Ingredient['id'], LoadedIngredient>
): T & { recipe: InventoryTarget } {
	const target = inv.recipeId
		? recipes.get(inv.recipeId)
		: inv.ingredientId
			? ingredientAsTarget(ingredients.get(inv.ingredientId) ?? missing(inv.ingredientId))
			: undefined
	if (!target) throw new Error(`Inventory row ${inv.id} points at nothing`)
	return { ...inv, recipe: target }
}

function missing(id: string): never {
	throw new Error(`Ingredient ${id} not found`)
}
