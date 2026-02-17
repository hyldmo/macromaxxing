import type { InferSelectModel } from 'drizzle-orm'
import type {
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
	usdaFoods,
	usdaPortions,
	userSettings,
	users,
	workoutExercises,
	workoutLogs,
	workoutSessions,
	workouts
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
export type Exercise = InferSelectModel<typeof exercises>
export type ExerciseMuscle = InferSelectModel<typeof exerciseMuscles>
export type StrengthStandard = InferSelectModel<typeof strengthStandards>
export type Workout = InferSelectModel<typeof workouts>
export type WorkoutExercise = InferSelectModel<typeof workoutExercises>
export type WorkoutSession = InferSelectModel<typeof workoutSessions>
export type WorkoutLog = InferSelectModel<typeof workoutLogs>
export type UsdaFood = InferSelectModel<typeof usdaFoods>
export type UsdaPortion = InferSelectModel<typeof usdaPortions>

export interface AbsoluteMacros {
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
	weight: number
}

export interface MacroTargets {
	kcal: number
	protein: number
	carbs: number
	fat: number
	fiber: number
}
