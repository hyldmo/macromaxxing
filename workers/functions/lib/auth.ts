import { users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { Database } from './db'

export interface AuthUser {
	id: string
	email: string
}

export async function authenticateRequest(request: Request, db: Database): Promise<AuthUser> {
	const userId = request.headers.get('X-User-ID')

	if (!userId) {
		throw new Error('Missing X-User-ID header')
	}

	// Upsert user
	const existing = await db.select().from(users).where(eq(users.id, userId)).get()
	if (!existing) {
		await db.insert(users).values({
			id: userId,
			email: `${userId}@anonymous`,
			createdAt: Date.now()
		})
	}

	return { id: userId, email: existing?.email ?? `${userId}@anonymous` }
}
