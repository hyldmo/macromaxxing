import { newId, users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { Database } from './db'

export interface AuthUser {
	id: string
	email: string
}

export async function authenticateRequest(request: Request, db: Database, isDev: boolean): Promise<AuthUser> {
	// Get user email from Cloudflare Access header
	let email = request.headers.get('CF-Access-Authenticated-User-Email')

	// In local dev, allow simulated auth via X-Dev-User-Email header
	if (!email && isDev) {
		email = request.headers.get('X-Dev-User-Email')
	}

	if (!email) {
		throw new Error('Not authenticated via Cloudflare Access')
	}

	// Look up user by email
	const existing = await db.select().from(users).where(eq(users.email, email)).get()
	if (existing) {
		return { id: existing.id, email: existing.email }
	}

	// Create new user with TypeID
	const userId = newId('usr')
	await db.insert(users).values({
		id: userId,
		email,
		createdAt: Date.now()
	})

	return { id: userId, email }
}
