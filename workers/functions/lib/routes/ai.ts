import { TRPCError } from '@trpc/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { calculateVolumeUnits, getModel, INGREDIENT_AI_PROMPT, lookupUSDA } from '../ai-utils'
import { cookedWeightSchema, ingredientAiSchema } from '../constants'
import { protectedProcedure, router } from '../trpc'
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
			// If unitsOnly is true, skip USDA and go straight to AI for density + units
			if (!input.unitsOnly) {
				// Try USDA first (free, accurate, fast)
				const usdaKey = ctx.env.USDA_API_KEY
				if (usdaKey) {
					const usdaResult = await lookupUSDA(input.ingredientName, usdaKey)
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

			const { output } = await generateText({
				model: getModel(settings.provider, settings.apiKey),
				output: Output.object({ schema: ingredientAiSchema }),
				prompt: `${INGREDIENT_AI_PROMPT}\n\nIngredient: ${input.ingredientName}`
			})

			// Merge AI units with calculated volume units if density exists
			const allUnits = [...output.units]
			if (output.density !== null) {
				const volumeUnits = calculateVolumeUnits(output.density)
				// Add volume units that don't already exist (by name, case-insensitive)
				const existingNames = new Set(allUnits.map(u => u.name.toLowerCase()))
				for (const vu of volumeUnits) {
					if (!existingNames.has(vu.name.toLowerCase())) {
						allUnits.push(vu)
					}
				}
			}

			return { ...output, units: allUnits, source: 'ai' as const }
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

			const { output } = await generateText({
				model: getModel(settings.provider, settings.apiKey),
				output: Output.object({ schema: cookedWeightSchema }),
				prompt: `Estimate the cooked weight for a recipe with these raw ingredients: ${ingredientList}. ${instructionsContext}Consider typical water loss/gain during cooking. Return weight in grams.`
			})

			return output
		})
})
