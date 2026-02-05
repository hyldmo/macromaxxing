import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { AiProvider } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { cookedWeightSchema, MODELS, macroSchema } from '../constants'
import { protectedProcedure, router } from '../trpc'
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

export const aiRouter = router({
	lookup: protectedProcedure
		.input(z.object({ ingredientName: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			// Try USDA first (free, accurate, fast)
			const usdaKey = ctx.env.USDA_API_KEY
			if (usdaKey) {
				const usdaResult = await lookupUSDA(input.ingredientName, usdaKey)
				if (usdaResult) {
					return { ...usdaResult, source: 'usda' as const }
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

			const { output } = await generateText({
				model: getModel(settings.provider, settings.apiKey),
				output: Output.object({ schema: macroSchema }),
				prompt: `Return nutritional values per 100g raw weight for: ${input.ingredientName}. Use USDA data.`
			})

			return { ...output, source: 'ai' as const }
		}),

	estimateCookedWeight: protectedProcedure
		.input(
			z.object({
				ingredients: z.array(z.object({ name: z.string(), grams: z.number() }))
			})
		)
		.mutation(async ({ ctx, input }) => {
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

			const ingredientList = input.ingredients.map(i => `${i.grams}g ${i.name}`).join(', ')

			const { output } = await generateText({
				model: getModel(settings.provider, settings.apiKey),
				output: Output.object({ schema: cookedWeightSchema }),
				prompt: `Estimate the cooked weight for a recipe with these raw ingredients: ${ingredientList}. Consider typical water loss/gain during cooking. Return weight in grams.`
			})

			return output
		})
})
