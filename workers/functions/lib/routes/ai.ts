import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { AiProvider } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { MODELS, macroSchema } from '../constants'
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

export const aiRouter = router({
	lookup: protectedProcedure
		.input(z.object({ ingredientName: z.string().min(1) }))
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

			const { object } = await generateObject({
				model: getModel(settings.provider, settings.apiKey),
				schema: macroSchema,
				prompt: `Return nutritional values per 100g raw weight for: ${input.ingredientName}. Use USDA data.`
			})

			return object
		})
})
