import { relations } from 'drizzle-orm'
import {
	exerciseMuscles,
	exercises,
	ingredients,
	ingredientUnits,
	mealPlanInventory,
	mealPlanSlots,
	mealPlans,
	recipeIngredients,
	recipes,
	strengthStandards,
	userSettings,
	users,
	workoutExercises,
	workoutLogs,
	workoutSessions,
	workouts
} from './schema'

export const usersRelations = relations(users, ({ one, many }) => ({
	settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
	recipes: many(recipes),
	ingredients: many(ingredients),
	mealPlans: many(mealPlans),
	exercises: many(exercises),
	workouts: many(workouts),
	workoutSessions: many(workoutSessions)
}))

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
	user: one(users, { fields: [userSettings.userId], references: [users.id] })
}))

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	user: one(users, { fields: [recipes.userId], references: [users.id] }),
	recipeIngredients: many(recipeIngredients, { relationName: 'parentRecipe' }),
	usedAsSubrecipeIn: many(recipeIngredients, { relationName: 'subrecipe' })
}))

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
	user: one(users, { fields: [ingredients.userId], references: [users.id] }),
	units: many(ingredientUnits)
}))

export const ingredientUnitsRelations = relations(ingredientUnits, ({ one }) => ({
	ingredient: one(ingredients, { fields: [ingredientUnits.ingredientId], references: [ingredients.id] })
}))

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
	recipe: one(recipes, {
		fields: [recipeIngredients.recipeId],
		references: [recipes.id],
		relationName: 'parentRecipe'
	}),
	ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] }),
	subrecipe: one(recipes, {
		fields: [recipeIngredients.subrecipeId],
		references: [recipes.id],
		relationName: 'subrecipe'
	})
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

// ─── Workout Tracking ────────────────────────────────────────────────

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
	user: one(users, { fields: [exercises.userId], references: [users.id] }),
	muscles: many(exerciseMuscles),
	logs: many(workoutLogs),
	workoutExercises: many(workoutExercises)
}))

export const exerciseMusclesRelations = relations(exerciseMuscles, ({ one }) => ({
	exercise: one(exercises, { fields: [exerciseMuscles.exerciseId], references: [exercises.id] })
}))

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
	user: one(users, { fields: [workouts.userId], references: [users.id] }),
	exercises: many(workoutExercises),
	sessions: many(workoutSessions)
}))

export const workoutExercisesRelations = relations(workoutExercises, ({ one }) => ({
	workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
	exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] })
}))

export const strengthStandardsRelations = relations(strengthStandards, ({ one }) => ({
	compound: one(exercises, {
		fields: [strengthStandards.compoundId],
		references: [exercises.id],
		relationName: 'compound'
	}),
	isolation: one(exercises, {
		fields: [strengthStandards.isolationId],
		references: [exercises.id],
		relationName: 'isolation'
	})
}))

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
	user: one(users, { fields: [workoutSessions.userId], references: [users.id] }),
	workout: one(workouts, { fields: [workoutSessions.workoutId], references: [workouts.id] }),
	logs: many(workoutLogs)
}))

export const workoutLogsRelations = relations(workoutLogs, ({ one }) => ({
	session: one(workoutSessions, { fields: [workoutLogs.sessionId], references: [workoutSessions.id] }),
	exercise: one(exercises, { fields: [workoutLogs.exerciseId], references: [exercises.id] })
}))
