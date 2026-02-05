import { relations } from 'drizzle-orm'
import { ingredients, recipeIngredients, recipes, userSettings, users } from './schema'

export const usersRelations = relations(users, ({ one, many }) => ({
	settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
	recipes: many(recipes),
	ingredients: many(ingredients)
}))

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
	user: one(users, { fields: [userSettings.userId], references: [users.id] })
}))

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	user: one(users, { fields: [recipes.userId], references: [users.id] }),
	recipeIngredients: many(recipeIngredients)
}))

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
	user: one(users, { fields: [ingredients.userId], references: [users.id] })
}))

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
	ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] })
}))
