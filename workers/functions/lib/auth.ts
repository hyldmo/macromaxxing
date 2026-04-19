import type { ClerkClient } from '@clerk/backend'
import { getAuth } from '@hono/clerk-auth'
import { users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import type { Database } from './db'

export interface AuthUser {
	id: string
	email: string
}

/**
 * Resolve a Clerk userId to a D1 AuthUser, creating a row on first login.
 * If a row already exists for the email (e.g. CF-Access migration), it is
 * returned as-is so the user keeps their original ID and FK references.
 */
export async function resolveClerkUser(db: Database, clerkClient: ClerkClient, clerkUserId: string): Promise<AuthUser> {
	const existing = await db.select().from(users).where(eq(users.id, clerkUserId)).get()
	if (existing) return { id: existing.id, email: existing.email }

	const clerkUser = await clerkClient.users.getUser(clerkUserId)
	const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress

	if (!email) throw new Error('Clerk user has no email')

	const byEmail = await db.select().from(users).where(eq(users.email, email)).get()
	if (byEmail) return { id: byEmail.id, email: byEmail.email }

	await db.insert(users).values({ id: clerkUserId, email, createdAt: Date.now() })
	return { id: clerkUserId, email }
}

export async function authenticateRequest(c: Context, db: Database, isDev: boolean): Promise<AuthUser> {
	// 1. Clerk auth (production + dev with Clerk running)
	const auth = getAuth(c)
	if (auth?.userId) {
		return resolveClerkUser(db, c.get('clerk'), auth.userId)
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
