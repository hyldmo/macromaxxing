import { ingredients, ingredientUnits, type TypeIDString, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { generateText, Output } from 'ai'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { calculateVolumeUnits, getModel, INGREDIENT_AI_PROMPT, lookupUSDA } from '../ai-utils'
import { ingredientAiSchema } from '../constants'
import { protectedProcedure, publicProcedure, router } from '../trpc'
import { toStartCase } from '../utils'
import { getDecryptedApiKey } from './settings'

// TODO: Replace with drizzle-zod once Buffer type detection is fixed for Cloudflare Workers
// See: https://github.com/drizzle-team/drizzle-orm/pull/5192
const createIngredientSchema = z.object({
	id: z.custom<TypeIDString<'ing'>>().optional(),
	name: z.string().min(1),
	protein: z.number().nonnegative(),
	carbs: z.number().nonnegative(),
	fat: z.number().nonnegative(),
	kcal: z.number().nonnegative(),
	fiber: z.number().nonnegative(),
	density: z.number().nonnegative().nullable().optional(),
	source: z.enum(['manual', 'ai', 'usda'])
})

const updateIngredientSchema = z.object({
	id: z.custom<TypeIDString<'ing'>>(),
	name: z.string().min(1).optional(),
	protein: z.number().nonnegative().optional(),
	carbs: z.number().nonnegative().optional(),
	fat: z.number().nonnegative().optional(),
	kcal: z.number().nonnegative().optional(),
	fiber: z.number().nonnegative().optional(),
	density: z.number().nonnegative().nullable().optional(),
	source: z.enum(['manual', 'ai', 'usda']).optional()
})

const createUnitSchema = z.object({
	ingredientId: z.custom<TypeIDString<'ing'>>(),
	name: z.string().min(1),
	grams: z.number().positive(),
	isDefault: z.boolean().optional()
})

const updateUnitSchema = z.object({
	id: z.custom<TypeIDString<'inu'>>(),
	name: z.string().min(1).optional(),
	grams: z.number().positive().optional(),
	isDefault: z.boolean().optional()
})

export const ingredientsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.ingredients.findMany({
			where: eq(ingredients.userId, ctx.user.id),
			with: { units: true },
			orderBy: (ingredients, { asc }) => [asc(ingredients.name)]
		})
	}),

	listPublic: publicProcedure.query(async ({ ctx }) => {
		return ctx.db.query.ingredients.findMany({
			with: { units: true },
			orderBy: (ingredients, { asc }) => [asc(ingredients.name)],
			limit: 200
		})
	}),

	create: protectedProcedure.input(createIngredientSchema).mutation(async ({ ctx, input }) => {
		const [ingredient] = await ctx.db
			.insert(ingredients)
			.values({
				userId: ctx.user.id,
				...input,
				name: toStartCase(input.name),
				createdAt: Date.now()
			})
			.returning()
		return ingredient
	}),

	update: protectedProcedure.input(updateIngredientSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input
		await ctx.db
			.update(ingredients)
			.set(updates)
			.where(and(eq(ingredients.id, id), eq(ingredients.userId, ctx.user.id)))
		return ctx.db.query.ingredients.findFirst({ where: eq(ingredients.id, id) })
	}),

	delete: protectedProcedure.input(zodTypeID('ing')).mutation(async ({ ctx, input }) => {
		await ctx.db.delete(ingredients).where(and(eq(ingredients.id, input), eq(ingredients.userId, ctx.user.id)))
	}),

	/** Find existing ingredient by name (case-insensitive) or create via USDA/AI lookup */
	findOrCreate: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
		const normalizedName = toStartCase(input.name)

		// Check for existing ingredient (case-insensitive)
		const existing = await ctx.db.query.ingredients.findFirst({
			where: sql`lower(${ingredients.name}) = lower(${normalizedName})`,
			with: { units: true }
		})

		if (existing) {
			return { ingredient: existing, source: 'existing' as const }
		}

		// Try USDA first (free, accurate, fast)
		const usdaKey = ctx.env.USDA_API_KEY
		if (usdaKey) {
			const usdaResult = await lookupUSDA(normalizedName, usdaKey)
			if (usdaResult) {
				const [ingredient] = await ctx.db
					.insert(ingredients)
					.values({
						userId: ctx.user.id,
						name: normalizedName,
						...usdaResult,
						source: 'usda',
						createdAt: Date.now()
					})
					.returning()

				// Add default 'g' unit for USDA ingredients
				await ctx.db.insert(ingredientUnits).values({
					ingredientId: ingredient.id,
					name: 'g',
					grams: 1,
					isDefault: 1,
					source: 'usda',
					createdAt: Date.now()
				})

				const ingredientWithUnits = await ctx.db.query.ingredients.findFirst({
					where: eq(ingredients.id, ingredient.id),
					with: { units: true }
				})

				return { ingredient: ingredientWithUnits!, source: 'usda' as const }
			}
		}

		// Fall back to AI
		const encryptionSecret = ctx.env.ENCRYPTION_SECRET
		if (!encryptionSecret) {
			throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ENCRYPTION_SECRET not configured' })
		}

		const settings = await getDecryptedApiKey(ctx.db, ctx.user.id, encryptionSecret)
		if (!settings) {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'No AI provider configured. Go to Settings to add your API key.'
			})
		}

		const { output: aiResult } = await generateText({
			model: getModel(settings.provider, settings.apiKey),
			output: Output.object({ schema: ingredientAiSchema }),
			prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${normalizedName}`
		})

		const { units, ...macros } = aiResult
		const [ingredient] = await ctx.db
			.insert(ingredients)
			.values({
				userId: ctx.user.id,
				name: normalizedName,
				...macros,
				source: 'ai',
				createdAt: Date.now()
			})
			.returning()

		// Merge AI units with calculated volume units if density exists
		const allUnits = [...units]
		if (aiResult.density !== null) {
			const volumeUnits = calculateVolumeUnits(aiResult.density)
			// Add volume units that don't already exist (by name, case-insensitive)
			const existingNames = new Set(allUnits.map(u => u.name.toLowerCase()))
			for (const vu of volumeUnits) {
				if (!existingNames.has(vu.name.toLowerCase())) {
					allUnits.push(vu)
				}
			}
		}

		// Insert all units (AI + calculated volume units)
		if (allUnits.length > 0) {
			await ctx.db.insert(ingredientUnits).values(
				allUnits.map(unit => ({
					ingredientId: ingredient.id,
					name: unit.name,
					grams: unit.grams,
					isDefault: unit.isDefault ? 1 : 0,
					source: 'ai' as const,
					createdAt: Date.now()
				}))
			)
		}

		const ingredientWithUnits = await ctx.db.query.ingredients.findFirst({
			where: eq(ingredients.id, ingredient.id),
			with: { units: true }
		})

		return { ingredient: ingredientWithUnits!, source: 'ai' as const }
	}),

	// Unit CRUD operations
	listUnits: protectedProcedure.input(zodTypeID('ing')).query(async ({ ctx, input }) => {
		return ctx.db.query.ingredientUnits.findMany({
			where: eq(ingredientUnits.ingredientId, input),
			orderBy: (units, { desc, asc }) => [desc(units.isDefault), asc(units.name)]
		})
	}),

	createUnit: protectedProcedure.input(createUnitSchema).mutation(async ({ ctx, input }) => {
		// Verify user owns the ingredient
		const ingredient = await ctx.db.query.ingredients.findFirst({
			where: and(eq(ingredients.id, input.ingredientId), eq(ingredients.userId, ctx.user.id))
		})
		if (!ingredient) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Ingredient not found' })
		}

		// If setting as default, unset other defaults first
		if (input.isDefault) {
			await ctx.db
				.update(ingredientUnits)
				.set({ isDefault: 0 })
				.where(eq(ingredientUnits.ingredientId, input.ingredientId))
		}

		const [unit] = await ctx.db
			.insert(ingredientUnits)
			.values({
				ingredientId: input.ingredientId,
				name: input.name,
				grams: input.grams,
				isDefault: input.isDefault ? 1 : 0,
				source: 'manual',
				createdAt: Date.now()
			})
			.returning()

		return unit
	}),

	updateUnit: protectedProcedure.input(updateUnitSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input

		// Verify user owns the ingredient
		const unit = await ctx.db.query.ingredientUnits.findFirst({
			where: eq(ingredientUnits.id, id),
			with: { ingredient: true }
		})
		if (!unit || unit.ingredient.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' })
		}

		// If setting as default, unset other defaults first
		if (updates.isDefault) {
			await ctx.db
				.update(ingredientUnits)
				.set({ isDefault: 0 })
				.where(eq(ingredientUnits.ingredientId, unit.ingredientId))
		}

		await ctx.db
			.update(ingredientUnits)
			.set({ ...updates, isDefault: updates.isDefault ? 1 : 0 })
			.where(eq(ingredientUnits.id, id))

		return ctx.db.query.ingredientUnits.findFirst({ where: eq(ingredientUnits.id, id) })
	}),

	deleteUnit: protectedProcedure.input(zodTypeID('inu')).mutation(async ({ ctx, input }) => {
		// Verify user owns the ingredient
		const unit = await ctx.db.query.ingredientUnits.findFirst({
			where: eq(ingredientUnits.id, input),
			with: { ingredient: true }
		})
		if (!unit || unit.ingredient.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' })
		}

		await ctx.db.delete(ingredientUnits).where(eq(ingredientUnits.id, input))
	})
})
