import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { decrypt, encrypt } from '../crypto'
import { userSettings } from '../schema'
import { protectedProcedure, router } from '../trpc'

const saveSettingsSchema = z.object({
	provider: z.enum(['gemini', 'openai', 'anthropic']),
	apiKey: z.string().min(1),
	model: z.string().min(1)
})

export const settingsRouter = router({
	get: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.user.id)
		})
		if (!settings) return null
		return {
			provider: settings.aiProvider,
			model: settings.aiModel,
			hasKey: true
		}
	}),

	save: protectedProcedure.input(saveSettingsSchema).mutation(async ({ ctx, input }) => {
		const encryptionSecret = ctx.env.ENCRYPTION_SECRET
		if (!encryptionSecret) throw new Error('ENCRYPTION_SECRET not configured')

		const { ciphertext, iv } = await encrypt(input.apiKey, encryptionSecret)

		const existing = await ctx.db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.user.id)
		})

		if (existing) {
			await ctx.db
				.update(userSettings)
				.set({
					aiProvider: input.provider,
					aiApiKey: ciphertext,
					aiKeyIv: iv,
					aiModel: input.model
				})
				.where(eq(userSettings.userId, ctx.user.id))
		} else {
			await ctx.db.insert(userSettings).values({
				userId: ctx.user.id,
				aiProvider: input.provider,
				aiApiKey: ciphertext,
				aiKeyIv: iv,
				aiModel: input.model
			})
		}
	})
})

export async function getDecryptedApiKey(
	db: any,
	userId: string,
	encryptionSecret: string
): Promise<{ apiKey: string; provider: string; model: string } | null> {
	const settings = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId)
	})
	if (!settings) return null

	const apiKey = await decrypt(settings.aiApiKey, settings.aiKeyIv, encryptionSecret)
	return {
		apiKey,
		provider: settings.aiProvider,
		model: settings.aiModel
	}
}
