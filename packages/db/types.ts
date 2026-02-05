import type { InferSelectModel } from 'drizzle-orm'
import type { ingredients, recipeIngredients, recipes, userSettings, users } from './schema'

export type User = InferSelectModel<typeof users>
export type UserSettings = InferSelectModel<typeof userSettings>
export type Ingredient = InferSelectModel<typeof ingredients>
export type Recipe = InferSelectModel<typeof recipes>
export type RecipeIngredient = InferSelectModel<typeof recipeIngredients>
