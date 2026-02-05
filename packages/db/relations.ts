import { relations } from 'drizzle-orm'
import {
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

export const usersRelations = relations(users, ({ one, many }) => ({
	settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
	recipes: many(recipes),
	ingredients: many(ingredients),
	mealPlans: many(mealPlans)
}))

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
	user: one(users, { fields: [userSettings.userId], references: [users.id] })
}))

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	user: one(users, { fields: [recipes.userId], references: [users.id] }),
	recipeIngredients: many(recipeIngredients)
}))

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
	user: one(users, { fields: [ingredients.userId], references: [users.id] }),
	units: many(ingredientUnits)
}))

export const ingredientUnitsRelations = relations(ingredientUnits, ({ one }) => ({
	ingredient: one(ingredients, { fields: [ingredientUnits.ingredientId], references: [ingredients.id] })
}))

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
	ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] })
}))

export const mealPlansRelations = relations(mealPlans, ({ one, many }) => ({
	user: one(users, { fields: [mealPlans.userId], references: [users.id] }),
	inventory: many(mealPlanInventory)
}))

export const mealPlanInventoryRelations = relations(mealPlanInventory, ({ one, many }) => ({
	mealPlan: one(mealPlans, { fields: [mealPlanInventory.mealPlanId], references: [mealPlans.id] }),
	recipe: one(recipes, { fields: [mealPlanInventory.recipeId], references: [recipes.id] }),
	slots: many(mealPlanSlots)
}))

export const mealPlanSlotsRelations = relations(mealPlanSlots, ({ one }) => ({
	inventory: one(mealPlanInventory, { fields: [mealPlanSlots.inventoryId], references: [mealPlanInventory.id] })
}))
