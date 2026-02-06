import { getAuth } from '@hono/clerk-auth'
import { users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import type { Database } from './db'

export interface AuthUser {
	id: string
	email: string
}

export async function authenticateRequest(c: Context, db: Database, isDev: boolean): Promise<AuthUser> {
	// 1. Clerk auth (production + dev with Clerk running)
	const auth = getAuth(c)
	if (auth?.userId) {
		const existing = await db.select().from(users).where(eq(users.id, auth.userId)).get()
		if (existing) return { id: existing.id, email: existing.email }

		// First login — fetch email from Clerk, create D1 user
		const clerkClient = c.get('clerk')
		const clerkUser = await clerkClient.users.getUser(auth.userId)
		const email = clerkUser.emailAddresses.find(
			(e: { id: string; emailAddress: string }) => e.id === clerkUser.primaryEmailAddressId
		)?.emailAddress

		if (!email) throw new Error('Clerk user has no email')

		// Check if user already exists by email (migration from CF-Access)
		const byEmail = await db.select().from(users).where(eq(users.email, email)).get()
		if (byEmail) {
			// Migrate: update their ID to Clerk ID
			// Since id is PK and referenced by FKs, create new row + migrate refs
			// For simplicity, just return the existing user (they keep old ID)
			return { id: byEmail.id, email: byEmail.email }
		}

		await db.insert(users).values({ id: auth.userId, email, createdAt: Date.now() })
		return { id: auth.userId, email }
	}

	// 2. Dev mode fallback (X-Dev-User-Email header)
	if (isDev) {
		const devEmail = c.req.header('X-Dev-User-Email')
		if (devEmail) {
			const existing = await db.select().from(users).where(eq(users.email, devEmail)).get()
			if (existing) return { id: existing.id, email: existing.email }

			const userId = `dev_${devEmail.replace(/[^a-z0-9]/gi, '_')}`
			await db.insert(users).values({ id: userId, email: devEmail, createdAt: Date.now() })
			return { id: userId, email: devEmail }
		}
	}

	throw new Error('Not authenticated')
}
