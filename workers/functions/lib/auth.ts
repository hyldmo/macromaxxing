import { users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { Database } from './db'

export interface AuthUser {
	id: string
	email: string
}

export async function authenticateRequest(request: Request, db: Database): Promise<AuthUser> {
	// Get user email from Cloudflare Access header
	const email = request.headers.get('CF-Access-Authenticated-User-Email')

	if (!email) {
		throw new Error('Not authenticated via Cloudflare Access')
	}

	// Use email as the user ID for simplicity
	const userId = email

	// Upsert user
	const existing = await db.select().from(users).where(eq(users.id, userId)).get()
	if (!existing) {
		await db.insert(users).values({
			id: userId,
			email,
			createdAt: Date.now()
		})
	}

	return { id: userId, email }
}
