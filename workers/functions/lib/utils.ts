import { extractPreparation, userSettings } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import type { Database } from './db'

/** Normalize an ingredient name: extract preparation (discard it) + Start Case */
export const normalizeIngredientName = (name: string): string => startCase(extractPreparation(name).name)

/**
 * Insert a default-valued userSettings row if one doesn't exist.
 *
 * Why: userSettings is only inserted by settings.saveProfile/settings.save today,
 * so first-time users without AI keys lack a row. Mutations writing to user_settings
 * (e.g. setActiveProgram) must call this first or their UPDATE silently no-ops.
 */
export async function ensureUserSettingsRow(db: Database, userId: string): Promise<void> {
	await db
		.insert(userSettings)
		.values({
			userId,
			aiProvider: 'gemini',
			aiApiKey: '',
			aiKeyIv: '',
			aiModel: ''
		})
		.onConflictDoNothing()
}
