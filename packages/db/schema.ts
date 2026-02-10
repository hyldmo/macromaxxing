import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { type AiProvider, type MuscleGroup, newId, type Sex, typeidCol } from './custom-types'

export const users = sqliteTable('users', {
	id: text('id').primaryKey(), // Clerk user ID (user_xxx)
	email: text('email').notNull().unique(),
	createdAt: integer('created_at').notNull()
})

export const userSettings = sqliteTable('user_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id),
	aiProvider: text('ai_provider').notNull().$type<AiProvider>(),
	aiApiKey: text('ai_api_key').notNull(), // AES-GCM encrypted
	aiKeyIv: text('ai_key_iv').notNull(), // IV for decryption
	aiModel: text('ai_model').notNull(),
	batchLookups: integer('batch_lookups').notNull().default(0), // 0=off, 1=on
	modelFallback: integer('model_fallback').notNull().default(0), // 0=off, 1=on
	heightCm: real('height_cm'),
	weightKg: real('weight_kg'),
	sex: text('sex').notNull().default('male').$type<Sex>()
})

export const ingredients = sqliteTable('ingredients', {
	id: typeidCol('ing')('id')
		.primaryKey()
		.$defaultFn(() => newId('ing')),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	protein: real('protein').notNull(), // per 100g raw
	carbs: real('carbs').notNull(),
	fat: real('fat').notNull(),
	kcal: real('kcal').notNull(),
	fiber: real('fiber').notNull(),
	density: real('density'), // g/ml, for volume conversions (null for solids)
	fdcId: integer('fdc_id'), // USDA FoodData Central ID
	source: text('source').notNull(), // 'manual' | 'ai' | 'usda'
	createdAt: integer('created_at').notNull()
})

export const ingredientUnits = sqliteTable('ingredient_units', {
	id: typeidCol('inu')('id')
		.primaryKey()
		.$defaultFn(() => newId('inu')),
	ingredientId: typeidCol('ing')('ingredient_id')
		.notNull()
		.references(() => ingredients.id, { onDelete: 'cascade' }),
	name: text('name').notNull(), // 'tbsp', 'scoop', 'pcs', 'medium'
	grams: real('grams').notNull(), // Grams per 1 unit
	isDefault: integer('is_default').notNull().default(0), // Default unit for this ingredient
	source: text('source').notNull(), // 'usda' | 'ai' | 'manual'
	createdAt: integer('created_at').notNull()
})

export const recipes = sqliteTable('recipes', {
	id: typeidCol('rcp')('id')
		.primaryKey()
		.$defaultFn(() => newId('rcp')),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	type: text('type').notNull().default('recipe'), // 'recipe' | 'premade'
	instructions: text('instructions'),
	cookedWeight: real('cooked_weight'), // nullable, null = use raw total
	portionSize: real('portion_size'), // null = entire dish is 1 portion
	isPublic: integer('is_public').notNull().default(0), // 0 = private, 1 = public
	sourceUrl: text('source_url'), // URL the recipe was imported from (null = manual/text)
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
})

export const recipeIngredients = sqliteTable('recipe_ingredients', {
	id: typeidCol('rci')('id')
		.primaryKey()
		.$defaultFn(() => newId('rci')),
	recipeId: typeidCol('rcp')('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	ingredientId: typeidCol('ing')('ingredient_id')
		.notNull()
		.references(() => ingredients.id),
	amountGrams: real('amount_grams').notNull(),
	displayUnit: text('display_unit'), // 'scoop' | 'tbsp' | NULL (grams)
	displayAmount: real('display_amount'), // 2 | NULL
	preparation: text('preparation'), // "minced", "finely chopped", etc.
	sortOrder: integer('sort_order').notNull()
})

// Meal plan template
export const mealPlans = sqliteTable('meal_plans', {
	id: typeidCol('mpl')('id')
		.primaryKey()
		.$defaultFn(() => newId('mpl')),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
})

// Inventory: recipes added to a plan's pool
export const mealPlanInventory = sqliteTable('meal_plan_inventory', {
	id: typeidCol('mpi')('id')
		.primaryKey()
		.$defaultFn(() => newId('mpi')),
	mealPlanId: typeidCol('mpl')('meal_plan_id')
		.notNull()
		.references(() => mealPlans.id, { onDelete: 'cascade' }),
	recipeId: typeidCol('rcp')('recipe_id')
		.notNull()
		.references(() => recipes.id),
	totalPortions: real('total_portions').notNull(),
	createdAt: integer('created_at').notNull()
})

// Allocated meal slots (references inventory, not recipe directly)
export const mealPlanSlots = sqliteTable('meal_plan_slots', {
	id: typeidCol('mps')('id')
		.primaryKey()
		.$defaultFn(() => newId('mps')),
	inventoryId: typeidCol('mpi')('inventory_id')
		.notNull()
		.references(() => mealPlanInventory.id, { onDelete: 'cascade' }),
	dayOfWeek: integer('day_of_week').notNull(), // 0=Mon, 6=Sun
	slotIndex: integer('slot_index').notNull(), // 0, 1, 2, 3...
	portions: real('portions').notNull().default(1), // Fractional allowed (0.5, 1.5)
	createdAt: integer('created_at').notNull()
})

// ─── Workout Tracking ────────────────────────────────────────────────

export const exercises = sqliteTable('exercises', {
	id: typeidCol('exc')('id')
		.primaryKey()
		.$defaultFn(() => newId('exc')),
	userId: text('user_id').references(() => users.id), // null = system exercise
	name: text('name').notNull(),
	type: text('type').notNull().$type<'compound' | 'isolation'>(),
	createdAt: integer('created_at').notNull()
})

export const exerciseMuscles = sqliteTable('exercise_muscles', {
	id: typeidCol('exm')('id')
		.primaryKey()
		.$defaultFn(() => newId('exm')),
	exerciseId: typeidCol('exc')('exercise_id')
		.notNull()
		.references(() => exercises.id, { onDelete: 'cascade' }),
	muscleGroup: text('muscle_group').notNull().$type<MuscleGroup>(),
	intensity: real('intensity').notNull() // 0.0-1.0
})

export const workouts = sqliteTable('workouts', {
	id: typeidCol('wkt')('id')
		.primaryKey()
		.$defaultFn(() => newId('wkt')),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
})

export const workoutExercises = sqliteTable('workout_exercises', {
	id: typeidCol('wke')('id')
		.primaryKey()
		.$defaultFn(() => newId('wke')),
	workoutId: typeidCol('wkt')('workout_id')
		.notNull()
		.references(() => workouts.id, { onDelete: 'cascade' }),
	exerciseId: typeidCol('exc')('exercise_id')
		.notNull()
		.references(() => exercises.id),
	sortOrder: integer('sort_order').notNull(),
	targetSets: integer('target_sets').notNull(),
	targetReps: integer('target_reps').notNull(),
	targetWeight: real('target_weight'), // null = find weight first session
	createdAt: integer('created_at').notNull()
})

export const strengthStandards = sqliteTable('strength_standards', {
	id: typeidCol('ssr')('id')
		.primaryKey()
		.$defaultFn(() => newId('ssr')),
	compoundId: typeidCol('exc')('compound_id')
		.notNull()
		.references(() => exercises.id),
	isolationId: typeidCol('exc')('isolation_id')
		.notNull()
		.references(() => exercises.id),
	maxRatio: real('max_ratio').notNull(),
	createdAt: integer('created_at').notNull()
})

export const workoutSessions = sqliteTable('workout_sessions', {
	id: typeidCol('wks')('id')
		.primaryKey()
		.$defaultFn(() => newId('wks')),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	workoutId: typeidCol('wkt')('workout_id').references(() => workouts.id), // null = legacy session
	name: text('name'),
	startedAt: integer('started_at').notNull(),
	completedAt: integer('completed_at'),
	notes: text('notes'),
	createdAt: integer('created_at').notNull()
})

export const workoutLogs = sqliteTable('workout_logs', {
	id: typeidCol('wkl')('id')
		.primaryKey()
		.$defaultFn(() => newId('wkl')),
	sessionId: typeidCol('wks')('session_id')
		.notNull()
		.references(() => workoutSessions.id, { onDelete: 'cascade' }),
	exerciseId: typeidCol('exc')('exercise_id')
		.notNull()
		.references(() => exercises.id),
	setNumber: integer('set_number').notNull(),
	setType: text('set_type').notNull().default('working').$type<'warmup' | 'working' | 'backoff' | 'backup'>(),
	weightKg: real('weight_kg').notNull(),
	reps: integer('reps').notNull(),
	rpe: real('rpe'), // 6-10
	failureFlag: integer('failure_flag').notNull().default(0),
	createdAt: integer('created_at').notNull()
})
