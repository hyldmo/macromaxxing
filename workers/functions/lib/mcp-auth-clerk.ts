import { getAuth } from '@hono/clerk-auth'
import type { Context } from 'hono'
import { type AuthUser, resolveClerkUser } from './auth'
import type { Database } from './db'

/**
 * Authenticate an MCP request using a Clerk-issued OAuth bearer token.
 * Returns the resolved D1 user, or null if no valid OAuth token is present.
 */
export async function authenticateClerkOAuth(c: Context, db: Database): Promise<AuthUser | null> {
	const auth = await getAuth(c, { acceptsToken: 'oauth_token' })
	if (!(auth?.isAuthenticated && auth.userId)) return null
	return resolveClerkUser(db, c.get('clerk'), auth.userId)
}
