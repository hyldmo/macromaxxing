import { TRPCError } from '@trpc/server'
import { Output } from 'ai'
import { z } from 'zod'
import {
	extractJsonLdRecipe,
	generateTextWithFallback,
	INGREDIENT_AI_PROMPT,
	isVolumeUnit,
	lookupUSDA,
	parseIngredientString,
	stripHtml
} from '../ai-utils'
import { cookedWeightSchema, ingredientAiSchema, parsedRecipeSchema } from '../constants'
import { protectedProcedure, router } from '../trpc'
import { normalizeIngredientName } from '../utils'
import { getDecryptedApiKey } from './settings'

export const aiRouter = router({
	lookup: protectedProcedure
		.input(
			z.object({
				ingredientName: z.string().min(1),
				unitsOnly: z.boolean().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const cleanName = normalizeIngredientName(input.ingredientName)

			// If unitsOnly is true, skip USDA and go straight to AI for density + units
			if (!input.unitsOnly) {
				// Try USDA first (free, accurate, fast)
				const usdaKey = ctx.env.USDA_API_KEY
				if (usdaKey) {
					const usdaResult = await lookupUSDA(cleanName, usdaKey)
					if (usdaResult) {
						const { fdcId, ...macros } = usdaResult
						return { ...macros, fdcId, density: null, units: [], source: 'usda' as const }
					}
				}
			}

			// Fall back to AI (or use AI directly when unitsOnly=true)
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

			const { output } = await generateTextWithFallback({
				provider: settings.provider,
				apiKey: settings.apiKey,
				output: Output.object({ schema: ingredientAiSchema }),
				prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${cleanName}`,
				fallback: settings.modelFallback
			})

			// Filter out volume units — they're derived from density on the frontend
			const nonVolumeUnits = output.units.filter(u => !isVolumeUnit(u.name))

			return { ...output, units: nonVolumeUnits, source: 'ai' as const }
		}),

	estimateCookedWeight: protectedProcedure
		.input(
			z.object({
				ingredients: z.array(z.object({ name: z.string(), grams: z.number() })),
				instructions: z.string().optional()
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
			const instructionsContext = input.instructions ? `Instructions: ${input.instructions}. ` : ''

			const { output } = await generateTextWithFallback({
				provider: settings.provider,
				apiKey: settings.apiKey,
				output: Output.object({ schema: cookedWeightSchema }),
				prompt: `Estimate the cooked weight for a recipe with these raw ingredients: ${ingredientList}. ${instructionsContext}Consider typical water loss/gain during cooking. Return weight in grams.`,
				fallback: settings.modelFallback
			})

			return output
		}),

	parseRecipe: protectedProcedure
		.input(
			z
				.object({
					url: z.string().url().optional(),
					text: z.string().optional()
				})
				.refine(data => data.url || data.text, { message: 'Either URL or text is required' })
		)
		.mutation(async ({ ctx, input }) => {
			let htmlContent: string | null = null

			// Step 1: If URL, fetch the page and try JSON-LD extraction
			if (input.url) {
				const response = await fetch(input.url, {
					headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Macromaxxing/1.0)' }
				})
				if (!response.ok) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `Failed to fetch URL: ${response.status} ${response.statusText}`
					})
				}
				htmlContent = await response.text()

				// Try JSON-LD extraction (free, no AI needed)
				const jsonLd = extractJsonLdRecipe(htmlContent)
				if (jsonLd) {
					const ingredients = jsonLd.ingredientStrings
						.map(s => parseIngredientString(s))
						.filter((x): x is NonNullable<typeof x> => x !== null)

					return {
						name: jsonLd.name,
						ingredients: ingredients.map(i => ({ ...i, preparation: i.preparation ?? null })),
						instructions: jsonLd.instructions,
						servings: jsonLd.servings,
						source: 'structured' as const
					}
				}
			}

			// Step 2: AI fallback — need API key
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

			let textContent: string
			if (input.text) {
				textContent = input.text.slice(0, 8000)
			} else if (htmlContent) {
				textContent = stripHtml(htmlContent).slice(0, 8000)
			} else {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'No content to parse' })
			}

			const { output } = await generateTextWithFallback({
				provider: settings.provider,
				apiKey: settings.apiKey,
				output: Output.object({ schema: parsedRecipeSchema }),
				prompt: `Parse this recipe into structured data. Extract the recipe name, all ingredients with numeric amounts and units (use metric where possible: g, ml, dl, tbsp, tsp, cup, pcs, large, medium, small), cooking instructions as numbered steps, and number of servings.\n\nRecipe text:\n${textContent}`,
				fallback: settings.modelFallback
			})

			return { ...output, source: 'ai' as const }
		})
})
