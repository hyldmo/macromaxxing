import { ingredients, ingredientUnits, type TypeIDString, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { Output } from 'ai'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
	BATCH_INGREDIENT_AI_PROMPT,
	densityFromPortions,
	fetchUsdaPortions,
	generateTextWithFallback,
	INGREDIENT_AI_PROMPT,
	isVolumeUnit,
	lookupUSDA
} from '../ai-utils'
import { batchIngredientAiSchema, ingredientAiSchema } from '../constants'
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
	fdcId: z.number().int().nullable().optional(),
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
	fdcId: z.number().int().nullable().optional(),
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
				const { fdcId, ...macros } = usdaResult

				// Get units from USDA portions, derive density from volume portions
				const usdaPortions = await fetchUsdaPortions(fdcId, usdaKey)
				let density = densityFromPortions(usdaPortions)

				// Non-volume USDA portions (pcs, large, small, oz, etc.) — store these
				const nonVolumeUnits = usdaPortions
					.filter(p => !isVolumeUnit(p.name))
					.map(p => ({ ...p, isDefault: false, source: 'usda' as const }))

				// If no density from USDA, try AI for density + piece units
				let aiPieceUnits: Array<{ name: string; grams: number; isDefault: boolean; source: 'ai' }> = []
				if (!density || nonVolumeUnits.length === 0) {
					const encSecret = ctx.env.ENCRYPTION_SECRET
					if (encSecret) {
						const settings = await getDecryptedApiKey(ctx.db, ctx.user.id, encSecret)
						if (settings) {
							try {
								const { output } = await generateTextWithFallback({
									provider: settings.provider,
									apiKey: settings.apiKey,
									output: Output.object({ schema: ingredientAiSchema }),
									prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${normalizedName}`,
									fallback: settings.modelFallback
								})
								if (!density) density = output.density
								// Only take non-volume units from AI that USDA doesn't already have
								const existingNames = new Set(nonVolumeUnits.map(u => u.name.toLowerCase()))
								aiPieceUnits = output.units
									.filter(
										u =>
											!isVolumeUnit(u.name) &&
											u.name.toLowerCase() !== 'g' &&
											!existingNames.has(u.name.toLowerCase())
									)
									.map(u => ({ ...u, source: 'ai' as const }))
							} catch {
								// AI unavailable
							}
						}
					}
				}

				const extraUnits = [...nonVolumeUnits, ...aiPieceUnits]

				const [ingredient] = await ctx.db
					.insert(ingredients)
					.values({
						userId: ctx.user.id,
						name: normalizedName,
						...macros,
						fdcId,
						density,
						source: 'usda',
						createdAt: Date.now()
					})
					.returning()

				// Always include 'g', plus USDA or AI-derived units
				const hasDefault = extraUnits.some(u => u.isDefault)
				const unitRows = [
					{ name: 'g', grams: 1, isDefault: !hasDefault, source: 'usda' as const },
					...extraUnits.filter(u => u.name.toLowerCase() !== 'g')
				]
				await ctx.db.insert(ingredientUnits).values(
					unitRows.map(unit => ({
						ingredientId: ingredient.id,
						name: unit.name,
						grams: unit.grams,
						isDefault: unit.isDefault ? 1 : 0,
						source: unit.source,
						createdAt: Date.now()
					}))
				)

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

		const { output: aiResult } = await generateTextWithFallback({
			provider: settings.provider,
			apiKey: settings.apiKey,
			output: Output.object({ schema: ingredientAiSchema }),
			prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${normalizedName}`,
			fallback: settings.modelFallback
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

		// Only store non-volume units (volume units are derived from density at read time)
		const nonVolumeAiUnits = units.filter(u => !isVolumeUnit(u.name))
		if (nonVolumeAiUnits.length > 0) {
			await ctx.db.insert(ingredientUnits).values(
				nonVolumeAiUnits.map(unit => ({
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

	/** Batch find or create multiple ingredients — single AI call for all unknowns */
	batchFindOrCreate: protectedProcedure
		.input(z.object({ names: z.array(z.string().min(1)).max(50) }))
		.mutation(async ({ ctx, input }) => {
			const normalizedNames = input.names.map(toStartCase)

			// 1. DB lookup all (case-insensitive)
			const existingAll = await ctx.db.query.ingredients.findMany({
				where: inArray(
					sql`lower(${ingredients.name})`,
					normalizedNames.map(n => n.toLowerCase())
				),
				with: { units: true }
			})
			const existingMap = new Map(existingAll.map(e => [e.name.toLowerCase(), e]))

			type ResultItem = { ingredient: (typeof existingAll)[number]; source: 'existing' | 'usda' | 'ai' }
			const results: (ResultItem | null)[] = normalizedNames.map(name => {
				const existing = existingMap.get(name.toLowerCase())
				return existing ? { ingredient: existing, source: 'existing' } : null
			})

			// Collect names that need lookup
			const missingIndices = results.map((r, i) => (r === null ? i : -1)).filter(i => i !== -1)
			if (missingIndices.length === 0) return results as ResultItem[]

			// 2. USDA lookup missing (parallel)
			const usdaKey = ctx.env.USDA_API_KEY
			const usdaResults = new Map<
				number,
				{ macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }; fdcId: number }
			>()

			if (usdaKey) {
				const usdaLookups = await Promise.all(
					missingIndices.map(async idx => {
						const result = await lookupUSDA(normalizedNames[idx], usdaKey)
						return { idx, result }
					})
				)
				for (const { idx, result } of usdaLookups) {
					if (result) {
						const { fdcId, ...macros } = result
						usdaResults.set(idx, { macros, fdcId })
					}
				}
			}

			// 3. Fetch USDA portions for found ingredients (parallel)
			const usdaPortionsMap = new Map<number, Awaited<ReturnType<typeof fetchUsdaPortions>>>()
			if (usdaKey && usdaResults.size > 0) {
				const portionLookups = await Promise.all(
					Array.from(usdaResults.entries()).map(async ([idx, { fdcId }]) => {
						const portions = await fetchUsdaPortions(fdcId, usdaKey)
						return { idx, portions }
					})
				)
				for (const { idx, portions } of portionLookups) {
					usdaPortionsMap.set(idx, portions)
				}
			}

			// 4. Collect AI needs
			// - USDA found but needs density/units enrichment
			// - Not in USDA at all
			const needsAiEnrichment: { idx: number; name: string }[] = [] // USDA found, needs density/units
			const needsFullAi: { idx: number; name: string }[] = [] // Not in USDA

			for (const idx of missingIndices) {
				if (usdaResults.has(idx)) {
					const portions = usdaPortionsMap.get(idx) ?? []
					const density = densityFromPortions(portions)
					const nonVolumeUnits = portions.filter(p => !isVolumeUnit(p.name))
					if (!density || nonVolumeUnits.length === 0) {
						needsAiEnrichment.push({ idx, name: normalizedNames[idx] })
					}
				} else {
					needsFullAi.push({ idx, name: normalizedNames[idx] })
				}
			}

			// 5. Single AI call for all collected ingredients
			const allAiNeeds = [...needsAiEnrichment, ...needsFullAi]
			const aiResultsMap = new Map<
				number,
				{
					density: number | null
					units: Array<{ name: string; grams: number; isDefault: boolean }>
				} & Partial<{
					protein: number
					carbs: number
					fat: number
					kcal: number
					fiber: number
				}>
			>()

			if (allAiNeeds.length > 0) {
				const encSecret = ctx.env.ENCRYPTION_SECRET
				if (!encSecret) {
					throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ENCRYPTION_SECRET not configured' })
				}
				const settings = await getDecryptedApiKey(ctx.db, ctx.user.id, encSecret)
				if (!settings) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'No AI provider configured. Go to Settings to add your API key.'
					})
				}

				const ingredientList = allAiNeeds.map(n => n.name).join('\n')
				const { output: aiOutput } = await generateTextWithFallback({
					provider: settings.provider,
					apiKey: settings.apiKey,
					output: Output.object({ schema: batchIngredientAiSchema }),
					prompt: `${BATCH_INGREDIENT_AI_PROMPT}\n\nIngredients:\n${ingredientList}`,
					fallback: settings.modelFallback
				})

				for (let i = 0; i < allAiNeeds.length; i++) {
					if (aiOutput[i]) {
						aiResultsMap.set(allAiNeeds[i].idx, aiOutput[i])
					}
				}
			}

			// 6. Create all missing ingredients in DB
			for (const idx of missingIndices) {
				const name = normalizedNames[idx]
				const usdaData = usdaResults.get(idx)
				const aiData = aiResultsMap.get(idx)

				let macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }
				let density: number | null = null
				let fdcId: number | null = null
				let source: 'usda' | 'ai'
				let allUnits: Array<{ name: string; grams: number; isDefault: boolean; source: 'usda' | 'ai' }> = []

				if (usdaData) {
					macros = usdaData.macros
					fdcId = usdaData.fdcId
					source = 'usda'

					const portions = usdaPortionsMap.get(idx) ?? []
					density = densityFromPortions(portions)
					const nonVolumeUnits = portions
						.filter(p => !isVolumeUnit(p.name))
						.map(p => ({ ...p, isDefault: false, source: 'usda' as const }))

					// Merge AI density/units if available
					if (aiData) {
						if (!density) density = aiData.density
						const existingNames = new Set(nonVolumeUnits.map(u => u.name.toLowerCase()))
						const aiPieceUnits = aiData.units
							.filter(
								u =>
									!isVolumeUnit(u.name) &&
									u.name.toLowerCase() !== 'g' &&
									!existingNames.has(u.name.toLowerCase())
							)
							.map(u => ({ ...u, source: 'ai' as const }))
						allUnits = [...nonVolumeUnits, ...aiPieceUnits]
					} else {
						allUnits = nonVolumeUnits
					}
				} else if (aiData) {
					macros = {
						protein: aiData.protein ?? 0,
						carbs: aiData.carbs ?? 0,
						fat: aiData.fat ?? 0,
						kcal: aiData.kcal ?? 0,
						fiber: aiData.fiber ?? 0
					}
					density = aiData.density
					source = 'ai'
					allUnits = aiData.units
						.filter(u => !isVolumeUnit(u.name))
						.map(u => ({ ...u, source: 'ai' as const }))
				} else {
					// No data at all — skip (shouldn't happen if AI was called)
					continue
				}

				const [ingredient] = await ctx.db
					.insert(ingredients)
					.values({
						userId: ctx.user.id,
						name,
						...macros,
						fdcId,
						density,
						source,
						createdAt: Date.now()
					})
					.returning()

				// Build unit rows (always include 'g')
				const hasDefault = allUnits.some(u => u.isDefault)
				const unitRows = [
					{ name: 'g', grams: 1, isDefault: !hasDefault, source: source },
					...allUnits.filter(u => u.name.toLowerCase() !== 'g')
				]
				await ctx.db.insert(ingredientUnits).values(
					unitRows.map(unit => ({
						ingredientId: ingredient.id,
						name: unit.name,
						grams: unit.grams,
						isDefault: unit.isDefault ? 1 : 0,
						source: unit.source,
						createdAt: Date.now()
					}))
				)

				const ingredientWithUnits = await ctx.db.query.ingredients.findFirst({
					where: eq(ingredients.id, ingredient.id),
					with: { units: true }
				})

				results[idx] = { ingredient: ingredientWithUnits!, source }
			}

			return results as ResultItem[]
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
