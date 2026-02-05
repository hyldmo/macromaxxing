import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { type AiProvider, ingredients, type TypeIDString, zodTypeID } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { generateText, Output } from 'ai'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { MODELS, macroSchema } from '../constants'
import { protectedProcedure, publicProcedure, router } from '../trpc'
import { getDecryptedApiKey } from './settings'

function getModel(provider: AiProvider, apiKey: string) {
	switch (provider) {
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(MODELS.gemini)
		case 'openai':
			return createOpenAI({ apiKey })(MODELS.openai)
		case 'anthropic':
			return createAnthropic({ apiKey })(MODELS.anthropic)
	}
}

// USDA nutrient IDs
const NUTRIENT_IDS = {
	protein: 1003,
	fat: 1004,
	carbs: 1005,
	kcal: 1008,
	fiber: 1079
} as const

type Macros = z.infer<typeof macroSchema>

async function lookupUSDA(ingredientName: string, apiKey: string): Promise<Macros | null> {
	const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
	url.searchParams.set('api_key', apiKey)
	url.searchParams.set('query', ingredientName)
	url.searchParams.set('pageSize', '5')
	// Prefer Foundation and SR Legacy (standard reference) for raw ingredients
	url.searchParams.set('dataType', 'Foundation,SR Legacy')

	const res = await fetch(url.toString())
	if (!res.ok) return null

	const data = (await res.json()) as {
		foods?: Array<{
			description: string
			foodNutrients?: Array<{ nutrientId: number; value: number }>
		}>
	}

	if (!data.foods?.length) return null

	// Use the first result
	const food = data.foods[0]
	const nutrients = food.foodNutrients ?? []

	const getNutrient = (id: number): number => nutrients.find(n => n.nutrientId === id)?.value ?? 0

	return {
		protein: getNutrient(NUTRIENT_IDS.protein),
		fat: getNutrient(NUTRIENT_IDS.fat),
		carbs: getNutrient(NUTRIENT_IDS.carbs),
		kcal: getNutrient(NUTRIENT_IDS.kcal),
		fiber: getNutrient(NUTRIENT_IDS.fiber)
	}
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
	source: z.enum(['manual', 'ai', 'usda']).optional()
})

export const ingredientsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.ingredients.findMany({
			where: eq(ingredients.userId, ctx.user.id),
			orderBy: (ingredients, { asc }) => [asc(ingredients.name)]
		})
	}),

	listPublic: publicProcedure.query(async ({ ctx }) => {
		return ctx.db.query.ingredients.findMany({
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
		// Check for existing ingredient (case-insensitive)
		const existing = await ctx.db.query.ingredients.findFirst({
			where: sql`lower(${ingredients.name}) = lower(${input.name})`
		})

		if (existing) {
			return { ingredient: existing, source: 'existing' as const }
		}

		// Try USDA first (free, accurate, fast)
		const usdaKey = ctx.env.USDA_API_KEY
		if (usdaKey) {
			const usdaResult = await lookupUSDA(input.name, usdaKey)
			if (usdaResult) {
				const [ingredient] = await ctx.db
					.insert(ingredients)
					.values({
						userId: ctx.user.id,
						name: input.name,
						...usdaResult,
						source: 'usda',
						createdAt: Date.now()
					})
					.returning()

				return { ingredient, source: 'usda' as const }
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

		const { output: macros } = await generateText({
			model: getModel(settings.provider, settings.apiKey),
			output: Output.object({ schema: macroSchema }),
			prompt: `Return nutritional values per 100g raw weight for: ${input.name}. Use USDA data.`
		})

		const [ingredient] = await ctx.db
			.insert(ingredients)
			.values({
				userId: ctx.user.id,
				name: input.name,
				...macros,
				source: 'ai',
				createdAt: Date.now()
			})
			.returning()

		return { ingredient, source: 'ai' as const }
	})
})
