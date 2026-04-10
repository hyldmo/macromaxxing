import { type AiProvider, apiTokens, type TypeIDString, userSettings, zAiProvider } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { MODELS } from '../constants'
import { decrypt, encrypt } from '../crypto'
import { generateToken, hashToken } from '../mcp-auth'
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
			where: { userId: ctx.user.id }
		})
		if (!settings) return null
		return {
			provider: settings.aiProvider,
			hasKey: Boolean(settings.aiApiKey),
			batchLookups: Boolean(settings.batchLookups),
			modelFallback: Boolean(settings.modelFallback),
			heightCm: settings.heightCm,
			weightKg: settings.weightKg,
			sex: settings.sex
		}
	}),

	getProfile: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db.query.userSettings.findFirst({
			where: { userId: ctx.user.id }
		})
		if (!settings) return null
		return {
			heightCm: settings.heightCm,
			weightKg: settings.weightKg,
			sex: settings.sex
		}
	}),

	saveProfile: protectedProcedure
		.input(
			z.object({
				heightCm: z.number().min(100).max(250).nullable(),
				weightKg: z.number().min(30).max(300).nullable(),
				sex: z.enum(['male', 'female'])
			})
		)
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.userSettings.findFirst({
				where: { userId: ctx.user.id }
			})
			if (existing) {
				await ctx.db
					.update(userSettings)
					.set({ heightCm: input.heightCm, weightKg: input.weightKg, sex: input.sex })
					.where(eq(userSettings.userId, ctx.user.id))
			} else {
				await ctx.db.insert(userSettings).values({
					userId: ctx.user.id,
					aiProvider: 'gemini',
					aiApiKey: '',
					aiKeyIv: '',
					aiModel: '',
					heightCm: input.heightCm,
					weightKg: input.weightKg,
					sex: input.sex
				})
			}
		}),

	save: protectedProcedure.input(saveSettingsSchema).mutation(async ({ ctx, input }) => {
		const existing = await ctx.db.query.userSettings.findFirst({
			where: { userId: ctx.user.id }
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
	}),

	listTokens: protectedProcedure.query(async ({ ctx }) => {
		const tokens = await ctx.db.query.apiTokens.findMany({
			where: { userId: ctx.user.id },
			orderBy: { createdAt: 'desc' }
		})
		return tokens.map(t => ({
			id: t.id,
			name: t.name,
			lastUsedAt: t.lastUsedAt,
			createdAt: t.createdAt
		}))
	}),

	createToken: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			const raw = generateToken()
			const hash = await hashToken(raw)
			const [token] = await ctx.db
				.insert(apiTokens)
				.values({
					userId: ctx.user.id,
					name: input.name,
					tokenHash: hash,
					createdAt: Date.now()
				})
				.returning()
			// Return the raw token ONCE. It cannot be retrieved again.
			return { id: token.id, name: token.name, token: raw }
		}),

	deleteToken: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'atok'>>() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(apiTokens).where(and(eq(apiTokens.id, input.id), eq(apiTokens.userId, ctx.user.id)))
		})
})

export async function getDecryptedApiKey(
	db: any,
	userId: string,
	encryptionSecret: string
): Promise<{ apiKey: string; provider: AiProvider; batchLookups: boolean; modelFallback: boolean } | null> {
	const settings = await db.query.userSettings.findFirst({
		where: { userId }
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
