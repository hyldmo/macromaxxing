import { type AiProvider, userSettings, zAiProvider } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { decrypt, encrypt } from '../crypto'
import { protectedProcedure, router } from '../trpc'

const saveSettingsSchema = z.object({
	provider: zAiProvider,
	apiKey: z.string().min(1)
})

export const settingsRouter = router({
	get: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.user.id)
		})
		if (!settings) return null
		return {
			provider: settings.aiProvider,
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
					aiKeyIv: iv
				})
				.where(eq(userSettings.userId, ctx.user.id))
		} else {
			await ctx.db.insert(userSettings).values({
				userId: ctx.user.id,
				aiProvider: input.provider,
				aiApiKey: ciphertext,
				aiKeyIv: iv,
				aiModel: '' // deprecated, kept for schema compatibility
			})
		}
	})
})

export async function getDecryptedApiKey(
	db: any,
	userId: string,
	encryptionSecret: string
): Promise<{ apiKey: string; provider: AiProvider } | null> {
	const settings = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId)
	})
	if (!settings) return null

	const apiKey = await decrypt(settings.aiApiKey, settings.aiKeyIv, encryptionSecret)
	return {
		apiKey,
		provider: settings.aiProvider
	}
}
