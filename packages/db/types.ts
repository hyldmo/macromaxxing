import type { InferSelectModel } from 'drizzle-orm'
import type {
	ingredients,
	ingredientUnits,
	mealPlanInventory,
	mealPlanSlots,
	mealPlans,
	recipeIngredients,
	recipes,
	userSettings,
	users
} from './schema'

export type User = InferSelectModel<typeof users>
export type UserSettings = InferSelectModel<typeof userSettings>
export type Ingredient = InferSelectModel<typeof ingredients>
export type IngredientUnit = InferSelectModel<typeof ingredientUnits>
export type Recipe = InferSelectModel<typeof recipes>
export type RecipeIngredient = InferSelectModel<typeof recipeIngredients>
export type MealPlan = InferSelectModel<typeof mealPlans>
export type MealPlanInventory = InferSelectModel<typeof mealPlanInventory>
export type MealPlanSlot = InferSelectModel<typeof mealPlanSlots>
