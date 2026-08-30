import {
	type AiProvider,
	activitySetting,
	apiTokens,
	estimateProfileTDEE,
	nutritionGoal,
	resolveActivityLevel,
	resolveMacroTargets,
	userSettings,
	zAiProvider,
	zodTypeID
} from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { MODELS } from '../constants'
import { decrypt, encrypt } from '../crypto'
import { generateToken, hashToken } from '../mcp-auth'
import { trainingHardSetsPerWeek, trainingSessionsPerWeek } from '../training-frequency'
import { protectedProcedure, router } from '../trpc'
import { ensureUserSettingsRow } from '../utils'

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
	get: protectedProcedure
		.meta({ description: 'Get user settings (AI provider, body profile)' })
		.query(async ({ ctx }) => {
			const settings = await ctx.db.query.userSettings.findFirst({
				where: { userId: ctx.user.id }
			})
			if (!settings) return null
			return {
				provider: settings.aiProvider,
				hasKey: Boolean(settings.aiApiKey),
				batchLookups: settings.batchLookups,
				modelFallback: settings.modelFallback,
				heightCm: settings.heightCm,
				weightKg: settings.weightKg,
				sex: settings.sex
			}
		}),

	// userSettings rows aren't created on signup, so the profile/target queries answer with
	// blanks rather than null — a first-time user must still be able to fill the form in.
	getProfile: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db.query.userSettings.findFirst({
			where: { userId: ctx.user.id }
		})
		return {
			heightCm: settings?.heightCm ?? null,
			weightKg: settings?.weightKg ?? null,
			age: settings?.age ?? null,
			sex: settings?.sex ?? 'male'
		}
	}),

	saveProfile: protectedProcedure
		.input(
			z.object({
				heightCm: z.number().min(100).max(250).nullable(),
				weightKg: z.number().min(30).max(300).nullable(),
				// Optional, not just nullable: a PWA bundle cached before this field shipped still
				// posts {heightCm, weightKg, sex}, and an omitted age must leave the column alone
				// rather than 400 the whole save.
				age: z.number().int().min(10).max(120).nullish(),
				sex: z.enum(['male', 'female'])
			})
		)
		.mutation(async ({ ctx, input }) => {
			await ensureUserSettingsRow(ctx.db, ctx.user.id)
			await ctx.db.update(userSettings).set(input).where(eq(userSettings.userId, ctx.user.id))
		}),

	getTargets: protectedProcedure
		.meta({
			description:
				"Get the user's daily macro targets (kcal/protein/carbs/fat/fiber) and TDEE. Pass nutritionGoal (cut, maintain, or bulk) to preview that goal without changing saved settings; omit it to use the saved goal."
		})
		.input(
			z
				.object({
					nutritionGoal: nutritionGoal.exclude(['custom']).optional()
				})
				.optional()
		)
		.query(async ({ ctx, input }) => {
			const [settings, sessionsPerWeek, hardSetsPerWeek] = await Promise.all([
				ctx.db.query.userSettings.findFirst({ where: { userId: ctx.user.id } }),
				trainingSessionsPerWeek(ctx.db, ctx.user.id),
				trainingHardSetsPerWeek(ctx.db, ctx.user.id)
			])
			const targetNutritionGoal = input?.nutritionGoal ?? settings?.nutritionGoal ?? null
			const profile = settings && {
				...settings,
				nutritionGoal: targetNutritionGoal,
				trainingSessionsPerWeek: sessionsPerWeek,
				trainingHardSetsPerWeek: hardSetsPerWeek
			}
			return {
				nutritionGoal: targetNutritionGoal,
				activityLevel: settings?.activityLevel ?? null,
				// Body profile echoed back so the settings form can explain a missing TDEE
				// without a second query.
				heightCm: settings?.heightCm ?? null,
				weightKg: settings?.weightKg ?? null,
				age: settings?.age ?? null,
				sex: settings?.sex ?? 'male',
				/** Drives the `auto` bracket — echoed so the form can preview it without a second query. */
				trainingSessionsPerWeek: sessionsPerWeek,
				/** Drives the carbohydrate floor — echoed for the same reason. */
				trainingHardSetsPerWeek: hardSetsPerWeek,
				/** What `auto` currently resolves to; equal to `activityLevel` for the fixed brackets. */
				resolvedActivityLevel: profile ? resolveActivityLevel(profile) : null,
				tdee: profile ? estimateProfileTDEE(profile) : null,
				/** What every surface renders against — derived unless the goal is `custom`. */
				targets: profile ? resolveMacroTargets(profile) : null
			}
		}),

	saveTargets: protectedProcedure
		.input(
			z.object({
				nutritionGoal: nutritionGoal.nullable(),
				activityLevel: activitySetting.nullable(),
				// Only read back when nutritionGoal is 'custom'; ignored for derived goals.
				targetKcal: z.number().min(0).max(20000).nullable(),
				targetProtein: z.number().min(0).max(1000).nullable(),
				targetCarbs: z.number().min(0).max(2000).nullable(),
				targetFat: z.number().min(0).max(1000).nullable(),
				targetFiber: z.number().min(0).max(500).nullable()
			})
		)
		.mutation(async ({ ctx, input }) => {
			await ensureUserSettingsRow(ctx.db, ctx.user.id)
			await ctx.db.update(userSettings).set(input).where(eq(userSettings.userId, ctx.user.id))
		}),

	save: protectedProcedure.input(saveSettingsSchema).mutation(async ({ ctx, input }) => {
		const existing = await ctx.db.query.userSettings.findFirst({
			where: { userId: ctx.user.id }
		})

		const toggleUpdates = {
			...(input.batchLookups !== undefined && { batchLookups: input.batchLookups }),
			...(input.modelFallback !== undefined && { modelFallback: input.modelFallback })
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

	deleteToken: protectedProcedure.input(z.object({ id: zodTypeID('atok') })).mutation(async ({ ctx, input }) => {
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
		batchLookups: settings.batchLookups,
		modelFallback: settings.modelFallback
	}
}
