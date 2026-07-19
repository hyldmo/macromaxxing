import { defineRelations } from 'drizzle-orm'
import * as schema from './schema'

export const relations = defineRelations(schema, r => ({
	users: {
		settings: r.one.userSettings({
			from: r.users.id,
			to: r.userSettings.userId
		}),
		recipes: r.many.recipes(),
		ingredients: r.many.ingredients(),
		mealPlans: r.many.mealPlans(),
		exercises: r.many.exercises(),
		workouts: r.many.workouts(),
		workoutSessions: r.many.workoutSessions(),
		workoutPrograms: r.many.workoutPrograms(),
		locations: r.many.locations(),
		apiTokens: r.many.apiTokens()
	},

	apiTokens: {
		user: r.one.users({
			from: r.apiTokens.userId,
			to: r.users.id,
			optional: false
		})
	},

	userSettings: {
		user: r.one.users({
			from: r.userSettings.userId,
			to: r.users.id,
			optional: false
		}),
		activeProgram: r.one.workoutPrograms({
			from: r.userSettings.activeProgramId,
			to: r.workoutPrograms.id
		})
	},

	recipes: {
		user: r.one.users({
			from: r.recipes.userId,
			to: r.users.id,
			optional: false
		}),
		recipeIngredients: r.many.recipeIngredients({ alias: 'parentRecipe' }),
		usedAsSubrecipeIn: r.many.recipeIngredients({ alias: 'subrecipe' })
	},

	ingredients: {
		user: r.one.users({
			from: r.ingredients.userId,
			to: r.users.id,
			optional: false
		}),
		units: r.many.ingredientUnits()
	},

	ingredientUnits: {
		ingredient: r.one.ingredients({
			from: r.ingredientUnits.ingredientId,
			to: r.ingredients.id,
			optional: false
		})
	},

	recipeIngredients: {
		recipe: r.one.recipes({
			from: r.recipeIngredients.recipeId,
			to: r.recipes.id,
			alias: 'parentRecipe',
			optional: false
		}),
		// ingredientId is nullable (null when subrecipe)
		ingredient: r.one.ingredients({
			from: r.recipeIngredients.ingredientId,
			to: r.ingredients.id
		}),
		// subrecipeId is nullable (null when ingredient)
		subrecipe: r.one.recipes({
			from: r.recipeIngredients.subrecipeId,
			to: r.recipes.id,
			alias: 'subrecipe'
		})
	},

	mealPlans: {
		user: r.one.users({
			from: r.mealPlans.userId,
			to: r.users.id,
			optional: false
		}),
		inventory: r.many.mealPlanInventory()
	},

	mealPlanInventory: {
		mealPlan: r.one.mealPlans({
			from: r.mealPlanInventory.mealPlanId,
			to: r.mealPlans.id,
			optional: false
		}),
		recipe: r.one.recipes({
			from: r.mealPlanInventory.recipeId,
			to: r.recipes.id,
			optional: false
		}),
		slots: r.many.mealPlanSlots()
	},

	mealPlanSlots: {
		inventory: r.one.mealPlanInventory({
			from: r.mealPlanSlots.inventoryId,
			to: r.mealPlanInventory.id,
			optional: false
		})
	},

	// ─── Workout Tracking ────────────────────────────────────────────────

	locations: {
		user: r.one.users({
			from: r.locations.userId,
			to: r.users.id,
			optional: false
		}),
		equipment: r.many.locationEquipment(),
		workouts: r.many.workouts(),
		sessions: r.many.workoutSessions()
	},

	locationEquipment: {
		location: r.one.locations({
			from: r.locationEquipment.locationId,
			to: r.locations.id,
			optional: false
		})
	},

	exercises: {
		// userId is nullable (null = system exercise)
		user: r.one.users({
			from: r.exercises.userId,
			to: r.users.id
		}),
		muscles: r.many.exerciseMuscles(),
		equipment: r.many.exerciseEquipment(),
		guide: r.one.exerciseGuides({
			from: r.exercises.id,
			to: r.exerciseGuides.exerciseId
		}),
		logs: r.many.workoutLogs(),
		workoutExercises: r.many.workoutExercises()
	},

	exerciseMuscles: {
		exercise: r.one.exercises({
			from: r.exerciseMuscles.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	exerciseEquipment: {
		exercise: r.one.exercises({
			from: r.exerciseEquipment.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	exerciseGuides: {
		exercise: r.one.exercises({
			from: r.exerciseGuides.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	workouts: {
		user: r.one.users({
			from: r.workouts.userId,
			to: r.users.id,
			optional: false
		}),
		exercises: r.many.workoutExercises(),
		sessions: r.many.workoutSessions(),
		programItems: r.many.workoutProgramItems(),
		// locationId is nullable (null = no location set)
		location: r.one.locations({
			from: r.workouts.locationId,
			to: r.locations.id
		})
	},

	workoutPrograms: {
		user: r.one.users({
			from: r.workoutPrograms.userId,
			to: r.users.id,
			optional: false
		}),
		items: r.many.workoutProgramItems()
	},

	workoutProgramItems: {
		program: r.one.workoutPrograms({
			from: r.workoutProgramItems.programId,
			to: r.workoutPrograms.id,
			optional: false
		}),
		workout: r.one.workouts({
			from: r.workoutProgramItems.workoutId,
			to: r.workouts.id,
			optional: false
		})
	},

	workoutExercises: {
		workout: r.one.workouts({
			from: r.workoutExercises.workoutId,
			to: r.workouts.id,
			optional: false
		}),
		exercise: r.one.exercises({
			from: r.workoutExercises.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	strengthStandards: {
		compound: r.one.exercises({
			from: r.strengthStandards.compoundId,
			to: r.exercises.id,
			alias: 'compound',
			optional: false
		}),
		isolation: r.one.exercises({
			from: r.strengthStandards.isolationId,
			to: r.exercises.id,
			alias: 'isolation',
			optional: false
		})
	},

	workoutSessions: {
		user: r.one.users({
			from: r.workoutSessions.userId,
			to: r.users.id,
			optional: false
		}),
		// workoutId is nullable (null = legacy session)
		workout: r.one.workouts({
			from: r.workoutSessions.workoutId,
			to: r.workouts.id
		}),
		// locationId is nullable (null = no location set)
		location: r.one.locations({
			from: r.workoutSessions.locationId,
			to: r.locations.id
		}),
		logs: r.many.workoutLogs(),
		plannedExercises: r.many.sessionPlannedExercises()
	},

	sessionPlannedExercises: {
		session: r.one.workoutSessions({
			from: r.sessionPlannedExercises.sessionId,
			to: r.workoutSessions.id,
			optional: false
		}),
		exercise: r.one.exercises({
			from: r.sessionPlannedExercises.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	workoutLogs: {
		session: r.one.workoutSessions({
			from: r.workoutLogs.sessionId,
			to: r.workoutSessions.id,
			optional: false
		}),
		exercise: r.one.exercises({
			from: r.workoutLogs.exerciseId,
			to: r.exercises.id,
			optional: false
		})
	},

	// ─── USDA Local Data ────────────────────────────────────────────────

	usdaFoods: {
		portions: r.many.usdaPortions()
	},

	usdaPortions: {
		food: r.one.usdaFoods({
			from: r.usdaPortions.fdcId,
			to: r.usdaFoods.fdcId,
			optional: false
		})
	}
}))
