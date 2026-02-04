import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	createdAt: integer('created_at').notNull()
})

export const userSettings = sqliteTable('user_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id),
	aiProvider: text('ai_provider').notNull(), // 'gemini' | 'openai' | 'anthropic'
	aiApiKey: text('ai_api_key').notNull(), // AES-GCM encrypted
	aiKeyIv: text('ai_key_iv').notNull(), // IV for decryption
	aiModel: text('ai_model').notNull()
})

export const ingredients = sqliteTable('ingredients', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	protein: real('protein').notNull(), // per 100g raw
	carbs: real('carbs').notNull(),
	fat: real('fat').notNull(),
	kcal: real('kcal').notNull(),
	fiber: real('fiber').notNull(),
	source: text('source').notNull(), // 'manual' | 'ai'
	createdAt: integer('created_at').notNull()
})

export const recipes = sqliteTable('recipes', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	cookedWeight: real('cooked_weight'), // nullable, null = use raw total
	portionSize: real('portion_size').notNull().default(100),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
})

export const recipeIngredients = sqliteTable('recipe_ingredients', {
	id: text('id').primaryKey(),
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	ingredientId: text('ingredient_id')
		.notNull()
		.references(() => ingredients.id),
	amountGrams: real('amount_grams').notNull(),
	sortOrder: integer('sort_order').notNull()
})
