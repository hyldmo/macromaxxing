/**
 * Shared Zod building blocks for list/query inputs.
 *
 * Hand-authored (not schema-generated): agent filters need joins, tenant rules,
 * and domain enums that don't fall out of drizzle-zod / createSelectSchema.
 * See CLAUDE.md Gotchas → drizzle-zod blocked on Workers.
 */
import { z } from 'zod'

/** Shared time-window vocabulary (analytics + listSessions + history). */
export const analyticsWindow = z.enum(['4w', '12w', '1y', 'all'])

export const windowInput = z.object({
	window: analyticsWindow.default('12w')
})

/** Optional limit/offset — omit limit to return the full result (UI default). */
export const paginationFields = {
	limit: z.number().int().min(1).max(100).optional(),
	offset: z.number().int().min(0).default(0).optional()
}

/** Case-insensitive substring search; empty/whitespace treated as absent. */
export const searchField = z.string().trim().min(1).optional()

/** Escape `%` / `_` so user search text is literal in SQL LIKE. */
export function escapeLikePattern(raw: string): string {
	return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
