import type { InferSelectModel } from 'drizzle-orm'
import type {
	apiTokens,
	exerciseEquipment,
	exerciseGuides,
	exerciseMuscles,
	exercises,
	ingredients,
	ingredientUnits,
	locationEquipment,
	locations,
	mealPlanInventory,
	mealPlanSlots,
	mealPlans,
	recipeIngredients,
	recipes,
	sessionPlannedExercises,
	strengthStandards,
	usdaFoods,
	usdaPortions,
	userSettings,
	users,
	workoutExercises,
	workoutLogs,
	workoutProgramItems,
	workoutPrograms,
	workoutSessions,
	workoutSkips,
	workouts
} from './schema'

export type User = InferSelectModel<typeof users>
export type UserSettings = InferSelectModel<typeof userSettings>
export type ApiToken = InferSelectModel<typeof apiTokens>
export type Ingredient = InferSelectModel<typeof ingredients>
export type IngredientUnit = InferSelectModel<typeof ingredientUnits>
export type Recipe = InferSelectModel<typeof recipes>
export type RecipeIngredient = InferSelectModel<typeof recipeIngredients>
export type MealPlan = InferSelectModel<typeof mealPlans>
export type MealPlanInventory = InferSelectModel<typeof mealPlanInventory>
export type MealPlanSlot = InferSelectModel<typeof mealPlanSlots>
export type Exercise = InferSelectModel<typeof exercises>
export type ExerciseMuscle = InferSelectModel<typeof exerciseMuscles>
export type ExerciseEquipment = InferSelectModel<typeof exerciseEquipment>
export type Location = InferSelectModel<typeof locations>
export type LocationEquipment = InferSelectModel<typeof locationEquipment>
export type ExerciseGuideRow = InferSelectModel<typeof exerciseGuides>
export type StrengthStandard = InferSelectModel<typeof strengthStandards>
export type Workout = InferSelectModel<typeof workouts>
export type WorkoutExercise = InferSelectModel<typeof workoutExercises>
export type WorkoutProgram = InferSelectModel<typeof workoutPrograms>
export type WorkoutProgramItem = InferSelectModel<typeof workoutProgramItems>
export type WorkoutSkip = InferSelectModel<typeof workoutSkips>
export type WorkoutSession = InferSelectModel<typeof workoutSessions>
export type SessionPlannedExercise = InferSelectModel<typeof sessionPlannedExercises>
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

/**
 * Daily nutrition goals — the target counterpart to `AbsoluteMacros` (grams, kcal excepted).
 *
 * `kcal` is a BUDGET: over and under both matter. The four macros are FLOORS: hitting one is
 * enough and exceeding it is fine, because the calories left after every floor is met belong to
 * no macro in particular. `MACRO_TARGET_KIND` (src/features/nutrition/utils/targets.ts) is where
 * that distinction turns into a rendered status, so the fields do NOT sum to `kcal` — see
 * `deriveMacroTargets`.
 */
export interface MacroTargets {
	kcal: number
	protein: number
	carbs: number
	fat: number
	fiber: number
}
