import { type AiProvider, userSettings, zAiProvider } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { MODELS } from '../constants'
import { decrypt, encrypt } from '../crypto'
import { protectedProcedure, router } from '../trpc'

async function verifyKey(provider: AiProvider, apiKey: string) {
	if (provider === 'gemini') {
		const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
		if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API key' })
	} else if (provider === 'openai') {
		const res = await fetch('https://api.openai.com/v1/models', {
			headers: { Authorization: `Bearer ${apiKey}` }
		})
		if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API key' })
	} else {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: MODELS[provider],
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }]
			})
		})
		if (!res.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API key' })
	}
}

const saveSettingsSchema = z.object({
	provider: zAiProvider,
	apiKey: z.string().min(1).optional(),
	batchLookups: z.boolean().optional(),
	modelFallback: z.boolean().optional()
})

export const settingsRouter = router({
	get: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.user.id)
		})
		if (!settings) return null
		return {
			provider: settings.aiProvider,
			hasKey: Boolean(settings.aiApiKey),
			batchLookups: Boolean(settings.batchLookups),
			modelFallback: Boolean(settings.modelFallback)
		}
	}),

	save: protectedProcedure.input(saveSettingsSchema).mutation(async ({ ctx, input }) => {
		const existing = await ctx.db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.user.id)
		})

		const toggleUpdates = {
			...(input.batchLookups !== undefined && { batchLookups: input.batchLookups ? 1 : 0 }),
			...(input.modelFallback !== undefined && { modelFallback: input.modelFallback ? 1 : 0 })
		}

		// If providing a new key, verify it first
		if (input.apiKey) {
			await verifyKey(input.provider, input.apiKey)

			const encryptionSecret = ctx.env.ENCRYPTION_SECRET
			if (!encryptionSecret) throw new Error('ENCRYPTION_SECRET not configured')

			const { ciphertext, iv } = await encrypt(input.apiKey, encryptionSecret)

			if (existing) {
				await ctx.db
					.update(userSettings)
					.set({ aiProvider: input.provider, aiApiKey: ciphertext, aiKeyIv: iv, ...toggleUpdates })
					.where(eq(userSettings.userId, ctx.user.id))
			} else {
				await ctx.db.insert(userSettings).values({
					userId: ctx.user.id,
					aiProvider: input.provider,
					aiApiKey: ciphertext,
					aiKeyIv: iv,
					aiModel: '',
					...toggleUpdates
				})
			}
		} else if (existing) {
			// Just update provider/toggles if no new key
			await ctx.db
				.update(userSettings)
				.set({ aiProvider: input.provider, ...toggleUpdates })
				.where(eq(userSettings.userId, ctx.user.id))
		} else {
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'API key required for initial setup' })
		}
	})
})

export async function getDecryptedApiKey(
	db: any,
	userId: string,
	encryptionSecret: string
): Promise<{ apiKey: string; provider: AiProvider; batchLookups: boolean; modelFallback: boolean } | null> {
	const settings = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId)
	})
	if (!settings) return null

	const apiKey = await decrypt(settings.aiApiKey, settings.aiKeyIv, encryptionSecret)
	return {
		apiKey,
		provider: settings.aiProvider,
		batchLookups: Boolean(settings.batchLookups),
		modelFallback: Boolean(settings.modelFallback)
	}
}
