import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { type AiProvider, newId, typeidCol } from './custom-types'

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	createdAt: integer('created_at').notNull()
})

export const userSettings = sqliteTable('user_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id),
	aiProvider: text('ai_provider').notNull().$type<AiProvider>(),
	aiApiKey: text('ai_api_key').notNull(), // AES-GCM encrypted
	aiKeyIv: text('ai_key_iv').notNull(), // IV for decryption
	aiModel: text('ai_model').notNull()
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
	instructions: text('instructions'),
	cookedWeight: real('cooked_weight'), // nullable, null = use raw total
	portionSize: real('portion_size'), // null = entire dish is 1 portion
	isPublic: integer('is_public').notNull().default(0), // 0 = private, 1 = public
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
