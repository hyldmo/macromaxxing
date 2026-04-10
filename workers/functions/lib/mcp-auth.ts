import { apiTokens } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { AuthUser } from './auth'
import type { Database } from './db'

/** SHA-256 hash a raw token to a hex string for storage/lookup */
export async function hashToken(raw: string): Promise<string> {
	const data = new TextEncoder().encode(raw)
	const buffer = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(buffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

/** Generate a random API token (32 bytes, hex-encoded = 64 chars) */
export function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

/** Authenticate a request by bearer token. Returns the user or null. */
export async function authenticateByToken(db: Database, authHeader: string | null): Promise<AuthUser | null> {
	if (!authHeader?.startsWith('Bearer ')) return null
	const raw = authHeader.slice(7)
	if (!raw) return null

	const hash = await hashToken(raw)
	const token = await db.query.apiTokens.findFirst({
		where: { tokenHash: hash }
	})
	if (!token) return null

	// Update lastUsedAt
	await db.update(apiTokens).set({ lastUsedAt: Date.now() }).where(eq(apiTokens.id, token.id))

	const user = await db.query.users.findFirst({
		where: { id: token.userId }
	})
	if (!user) return null

	return { id: user.id, email: user.email }
}
