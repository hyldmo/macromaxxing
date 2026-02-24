import { ingredients, ingredientUnits, type TypeIDString, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { Output } from 'ai'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { isPresent } from 'ts-extras'
import { z } from 'zod'
import {
	BATCH_INGREDIENT_AI_PROMPT,
	densityFromPortions,
	fetchLocalUsdaPortions,
	fetchUsdaPortions,
	generateTextWithFallback,
	getLocalUsdaFood,
	INGREDIENT_AI_PROMPT,
	isVolumeUnit,
	lookupLocalUSDA,
	lookupUSDA,
	searchLocalUSDA,
	searchUSDA
} from '../ai-utils'
import { batchIngredientAiSchema, ingredientAiSchema } from '../constants'
import { protectedProcedure, publicProcedure, router, type TRPCContext } from '../trpc'
import { normalizeIngredientName } from '../utils'
import { getDecryptedApiKey } from './settings'

type UnitSource = 'usda' | 'ai'
type PortionUnit = { name: string; grams: number; isDefault: boolean; source: UnitSource }

function portionsToUnits(portions: Array<{ name: string; grams: number }>): PortionUnit[] {
	return portions.filter(p => !isVolumeUnit(p.name)).map(p => ({ ...p, isDefault: false, source: 'usda' as const }))
}

/** Try AI to fill in missing density or piece units (e.g. pcs, large). Silently returns nulls if AI is unavailable. */
async function tryAiEnrichment(
	ctx: { db: TRPCContext['db']; user: { id: string }; env: { ENCRYPTION_SECRET?: string } },
	ingredientName: string,
	existingUnits: Array<{ name: string }>
) {
	const encSecret = ctx.env.ENCRYPTION_SECRET
	if (!encSecret) return { density: null as number | null, units: [] as PortionUnit[] }

	const settings = await getDecryptedApiKey(ctx.db, ctx.user.id, encSecret)
	if (!settings) return { density: null as number | null, units: [] as PortionUnit[] }

	try {
		const { output } = await generateTextWithFallback({
			provider: settings.provider,
			apiKey: settings.apiKey,
			output: Output.object({ schema: ingredientAiSchema }),
			prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${ingredientName}`,
			fallback: settings.modelFallback
		})

		const existingNames = new Set(existingUnits.map(u => u.name.toLowerCase()))
		const units: PortionUnit[] = output.units
			.filter(
				u => !isVolumeUnit(u.name) && u.name.toLowerCase() !== 'g' && !existingNames.has(u.name.toLowerCase())
			)
			.map(u => ({ ...u, source: 'ai' as const }))

		return { density: output.density, units }
	} catch {
		return { density: null as number | null, units: [] as PortionUnit[] }
	}
}

/** Insert ingredient + unit rows, return ingredient with units loaded */
async function insertIngredientWithUnits(
	db: TRPCContext['db'],
	userId: string,
	data: {
		name: string
		macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }
		fdcId?: number | null
		density: number | null
		source: UnitSource
		units: PortionUnit[]
	}
) {
	const [ingredient] = await db
		.insert(ingredients)
		.values({
			userId,
			name: data.name,
			...data.macros,
			fdcId: data.fdcId ?? null,
			density: data.density,
			source: data.source,
			createdAt: Date.now()
		})
		.returning()

	const hasDefault = data.units.some(u => u.isDefault)
	const unitRows = [
		{ name: 'g', grams: 1, isDefault: !hasDefault, source: data.source },
		...data.units.filter(u => u.name.toLowerCase() !== 'g')
	]
	await db.insert(ingredientUnits).values(
		unitRows.map(unit => ({
			ingredientId: ingredient.id,
			name: unit.name,
			grams: unit.grams,
			isDefault: unit.isDefault ? 1 : 0,
			source: unit.source,
			createdAt: Date.now()
		}))
	)

	return (await db.query.ingredients.findFirst({
		where: { id: ingredient.id },
		with: { units: true }
	}))!
}

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
	source: z.enum(['manual', 'ai', 'usda', 'label'])
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
	list: publicProcedure
		.input(z.object({ search: z.string().optional() }).optional())
		.query(async ({ ctx, input }) => {
			const search = input?.search?.trim()
			return ctx.db.query.ingredients.findMany({
				where: search
					? { OR: [{ source: { ne: 'label' } }, { source: 'label', name: search }] }
					: { source: { ne: 'label' } },
				with: { units: true },
				orderBy: { name: 'asc' },
				limit: 200
			})
		}),

	searchUSDA: publicProcedure.input(z.object({ query: z.string().min(2) })).query(async ({ ctx, input }) => {
		// Search local USDA tables first
		const localResults = await searchLocalUSDA(ctx.db, input.query, 10)
		if (localResults.length > 0) return localResults

		// Fall back to USDA API if no local results
		const apiKey = ctx.env.USDA_API_KEY
		if (!apiKey) return []
		return searchUSDA(input.query, apiKey, 10)
	}),

	createFromUSDA: protectedProcedure
		.input(z.object({ fdcId: z.number().int(), name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			// Check if ingredient with same fdcId already exists
			const existing = await ctx.db.query.ingredients.findFirst({
				where: { fdcId: input.fdcId },
				with: { units: true }
			})
			if (existing) {
				return { ingredient: existing, source: 'existing' as const }
			}

			// Resolve USDA data (local by fdcId → API by name)
			let macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }
			let density: number | null = null
			let nonVolumeUnits: PortionUnit[] = []

			const localFood = await getLocalUsdaFood(ctx.db, input.fdcId)
			if (localFood) {
				;({ density, ...macros } = localFood)
				const localPortions = await fetchLocalUsdaPortions(ctx.db, input.fdcId)
				if (!density) density = densityFromPortions(localPortions)
				nonVolumeUnits = portionsToUnits(localPortions)
			} else {
				const apiKey = ctx.env.USDA_API_KEY
				if (!apiKey)
					throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'USDA API key not configured' })
				const usdaResult = await lookupUSDA(input.name, apiKey)
				if (!usdaResult) throw new TRPCError({ code: 'NOT_FOUND', message: 'USDA food not found' })
				const { fdcId: _, description: __, ...m } = usdaResult
				macros = m
				const usdaPortions = await fetchUsdaPortions(input.fdcId, apiKey)
				density = densityFromPortions(usdaPortions)
				nonVolumeUnits = portionsToUnits(usdaPortions)
			}

			// AI enrichment if missing density or physical units
			if (!density || nonVolumeUnits.length === 0) {
				const ai = await tryAiEnrichment(ctx, input.name, nonVolumeUnits)
				if (!density) density = ai.density
				nonVolumeUnits = [...nonVolumeUnits, ...ai.units]
			}

			const ingredient = await insertIngredientWithUnits(ctx.db, ctx.user.id, {
				name: normalizeIngredientName(input.name),
				macros,
				fdcId: input.fdcId,
				density,
				source: 'usda',
				units: nonVolumeUnits
			})
			return { ingredient, source: 'usda' as const }
		}),

	create: protectedProcedure.input(createIngredientSchema).mutation(async ({ ctx, input }) => {
		const [ingredient] = await ctx.db
			.insert(ingredients)
			.values({
				userId: ctx.user.id,
				...input,
				name: normalizeIngredientName(input.name),
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
		return ctx.db.query.ingredients.findFirst({ where: { id } })
	}),

	delete: protectedProcedure.input(zodTypeID('ing')).mutation(async ({ ctx, input }) => {
		await ctx.db.delete(ingredients).where(and(eq(ingredients.id, input), eq(ingredients.userId, ctx.user.id)))
	}),

	/** Find existing ingredient by name (case-insensitive) or create via USDA/AI lookup */
	findOrCreate: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
		const normalizedName = normalizeIngredientName(input.name)

		// Check for existing ingredient (case-insensitive)
		const existing = await ctx.db.query.ingredients.findFirst({
			where: { RAW: t => sql`lower(${t.name}) = lower(${normalizedName})` },
			with: { units: true }
		})

		if (existing) {
			return { ingredient: existing, source: 'existing' as const }
		}

		// USDA resolution (local exact match → API)
		let usdaData: {
			fdcId: number
			macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }
			density: number | null
			nonVolumeUnits: PortionUnit[]
		} | null = null

		const localUsda = await lookupLocalUSDA(ctx.db, normalizedName)
		if (localUsda) {
			const { fdcId, description: _, ...macros } = localUsda
			const localPortions = await fetchLocalUsdaPortions(ctx.db, fdcId)
			usdaData = {
				fdcId,
				macros,
				density: densityFromPortions(localPortions),
				nonVolumeUnits: portionsToUnits(localPortions)
			}
		} else {
			const usdaKey = ctx.env.USDA_API_KEY
			if (usdaKey) {
				const usdaResult = await lookupUSDA(normalizedName, usdaKey)
				if (usdaResult) {
					const { fdcId, ...macros } = usdaResult
					const usdaPortions = await fetchUsdaPortions(fdcId, usdaKey)
					usdaData = {
						fdcId,
						macros,
						density: densityFromPortions(usdaPortions),
						nonVolumeUnits: portionsToUnits(usdaPortions)
					}
				}
			}
		}

		if (usdaData) {
			let { density } = usdaData
			let units = usdaData.nonVolumeUnits

			if (!density || units.length === 0) {
				const ai = await tryAiEnrichment(ctx, normalizedName, units)
				if (!density) density = ai.density
				units = [...units, ...ai.units]
			}

			const ingredient = await insertIngredientWithUnits(ctx.db, ctx.user.id, {
				name: normalizedName,
				macros: usdaData.macros,
				fdcId: usdaData.fdcId,
				density,
				source: 'usda',
				units
			})
			return { ingredient, source: 'usda' as const }
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

		const { units: aiUnits, density: aiDensity, ...macros } = aiResult
		const ingredient = await insertIngredientWithUnits(ctx.db, ctx.user.id, {
			name: normalizedName,
			macros,
			density: aiDensity,
			source: 'ai',
			units: aiUnits.filter(u => !isVolumeUnit(u.name)).map(u => ({ ...u, source: 'ai' as const }))
		})
		return { ingredient, source: 'ai' as const }
	}),

	/** Batch find or create multiple ingredients — single AI call for all unknowns */
	batchFindOrCreate: protectedProcedure
		.input(z.object({ names: z.array(z.string().min(1)).max(50) }))
		.mutation(async ({ ctx, input }) => {
			const normalizedNames = input.names.map(normalizeIngredientName)

			// 1. DB lookup all (case-insensitive)
			const existingAll = await ctx.db.query.ingredients.findMany({
				where: {
					RAW: t =>
						inArray(
							sql`lower(${t.name})`,
							normalizedNames.map(n => n.toLowerCase())
						)
				},
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

			// 2. Resolve USDA data (local exact match first, then API for remaining)
			const usdaResults = new Map<
				number,
				{ macros: { protein: number; carbs: number; fat: number; kcal: number; fiber: number }; fdcId: number }
			>()
			const usdaPortionsMap = new Map<number, Awaited<ReturnType<typeof fetchUsdaPortions>>>()

			// 2a. Local USDA exact match (parallel)
			const localLookups = await Promise.all(
				missingIndices.map(async idx => {
					const result = await lookupLocalUSDA(ctx.db, normalizedNames[idx])
					return { idx, result }
				})
			)

			const localPortionLookups = await Promise.all(
				localLookups
					.filter(l => l.result !== null)
					.map(async ({ idx, result }) => {
						const { fdcId, description: _, ...macros } = result!
						usdaResults.set(idx, { macros, fdcId })
						const portions = await fetchLocalUsdaPortions(ctx.db, fdcId)
						return { idx, portions }
					})
			)
			for (const { idx, portions } of localPortionLookups) {
				usdaPortionsMap.set(idx, portions)
			}

			// 2b. USDA API for items not found locally (parallel)
			const usdaKey = ctx.env.USDA_API_KEY
			const needsApiLookup = missingIndices.filter(i => !usdaResults.has(i))

			if (usdaKey && needsApiLookup.length > 0) {
				const usdaLookups = await Promise.all(
					needsApiLookup.map(async idx => {
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

			// 2c. Fetch USDA API portions for API-found items (parallel)
			const needsApiPortions = Array.from(usdaResults.entries()).filter(([idx]) => !usdaPortionsMap.has(idx))
			if (usdaKey && needsApiPortions.length > 0) {
				const portionLookups = await Promise.all(
					needsApiPortions.map(async ([idx, { fdcId }]) => {
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
				// Only throw when items have no USDA data at all (needsFullAi).
				// USDA-found items needing enrichment can still be created without AI.
				const encSecret = ctx.env.ENCRYPTION_SECRET
				if (needsFullAi.length > 0 && !encSecret) {
					throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ENCRYPTION_SECRET not configured' })
				}
				const settings = encSecret ? await getDecryptedApiKey(ctx.db, ctx.user.id, encSecret) : null
				if (needsFullAi.length > 0 && !settings) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'No AI provider configured. Go to Settings to add your API key.'
					})
				}

				if (settings) {
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
				let units: PortionUnit[] = []

				if (usdaData) {
					macros = usdaData.macros
					fdcId = usdaData.fdcId
					source = 'usda'
					const portions = usdaPortionsMap.get(idx) ?? []
					density = densityFromPortions(portions)
					units = portionsToUnits(portions)

					if (aiData) {
						if (!density) density = aiData.density
						const existingNames = new Set(units.map(u => u.name.toLowerCase()))
						units = [
							...units,
							...aiData.units
								.filter(
									u =>
										!isVolumeUnit(u.name) &&
										u.name.toLowerCase() !== 'g' &&
										!existingNames.has(u.name.toLowerCase())
								)
								.map(u => ({ ...u, source: 'ai' as const }))
						]
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
					units = aiData.units.filter(u => !isVolumeUnit(u.name)).map(u => ({ ...u, source: 'ai' as const }))
				} else {
					continue
				}

				const ingredient = await insertIngredientWithUnits(ctx.db, ctx.user.id, {
					name,
					macros,
					fdcId,
					density,
					source,
					units
				})
				results[idx] = { ingredient, source }
			}

			return results.filter(isPresent)
		}),

	// Unit CRUD operations
	listUnits: protectedProcedure.input(zodTypeID('ing')).query(async ({ ctx, input }) => {
		return ctx.db.query.ingredientUnits.findMany({
			where: { ingredientId: input },
			orderBy: { isDefault: 'desc', name: 'asc' }
		})
	}),

	createUnit: protectedProcedure.input(createUnitSchema).mutation(async ({ ctx, input }) => {
		// Verify user owns the ingredient
		const ingredient = await ctx.db.query.ingredients.findFirst({
			where: { id: input.ingredientId, userId: ctx.user.id }
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
			where: { id },
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

		return ctx.db.query.ingredientUnits.findFirst({ where: { id } })
	}),

	deleteUnit: protectedProcedure.input(zodTypeID('inu')).mutation(async ({ ctx, input }) => {
		// Verify user owns the ingredient
		const unit = await ctx.db.query.ingredientUnits.findFirst({
			where: { id: input },
			with: { ingredient: true }
		})
		if (!unit || unit.ingredient.userId !== ctx.user.id) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' })
		}

		await ctx.db.delete(ingredientUnits).where(eq(ingredientUnits.id, input))
	})
})
