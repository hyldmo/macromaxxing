import { clerkMiddleware } from '@hono/clerk-auth'
import { trpcServer } from '@hono/trpc-server'
import { recipes, type TypeIDString } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { ExecutionContext as HonoExecutionContext } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authenticateRequest } from '../lib/auth'
import { createDb } from '../lib/db'
import { handleMcpRequest } from '../lib/mcp'
import { authenticateByToken } from '../lib/mcp-auth'
import { authenticateClerkOAuth } from '../lib/mcp-auth-clerk'
import { appRouter } from '../lib/router'

const MCP_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/mcp'

type HonoEnv = { Bindings: Cloudflare.Env }

const app = new Hono<HonoEnv>()

app.use('*', cors())
app.use('*', clerkMiddleware())

// ─── Image Upload/Delete (raw Hono routes, tRPC doesn't support multipart) ───

app.post('/api/recipes/:id/image', async c => {
	const db = createDb(c.env.DB)
	const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1'
	const user = await authenticateRequest(c, db, isDev).catch(() => null)
	if (!user) return c.json({ error: 'Unauthorized' }, 401)

	const recipeId = c.req.param('id') as TypeIDString<'rcp'>
	const recipe = await db.query.recipes.findFirst({
		where: { id: recipeId, userId: user.id }
	})
	if (!recipe) return c.json({ error: 'Not found' }, 404)

	const formData = await c.req.formData()
	const file = formData.get('image') as File | null
	if (!file) return c.json({ error: 'No image provided' }, 400)
	if (file.size > 5 * 1024 * 1024) return c.json({ error: 'File too large (max 5MB)' }, 400)
	if (!file.type.startsWith('image/')) return c.json({ error: 'Invalid file type' }, 400)

	// Delete old R2 object if previous image was an upload (not external URL)
	if (recipe.image && !recipe.image.startsWith('http')) {
		await c.env.IMAGES.delete(`recipes/${recipe.image}`)
	}

	const key = `recipes/${recipeId}`
	await c.env.IMAGES.put(key, file.stream(), {
		httpMetadata: { contentType: file.type }
	})

	await db.update(recipes).set({ image: recipeId, updatedAt: Date.now() }).where(eq(recipes.id, recipeId))

	return c.json({ image: recipeId })
})

app.delete('/api/recipes/:id/image', async c => {
	const db = createDb(c.env.DB)
	const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1'
	const user = await authenticateRequest(c, db, isDev).catch(() => null)
	if (!user) return c.json({ error: 'Unauthorized' }, 401)

	const recipeId = c.req.param('id') as TypeIDString<'rcp'>
	const recipe = await db.query.recipes.findFirst({
		where: { id: recipeId, userId: user.id }
	})
	if (!recipe) return c.json({ error: 'Not found' }, 404)

	// Delete R2 object if image was an upload
	if (recipe.image && !recipe.image.startsWith('http')) {
		await c.env.IMAGES.delete(`recipes/${recipe.image}`)
	}

	await db.update(recipes).set({ image: null, updatedAt: Date.now() }).where(eq(recipes.id, recipeId))

	return c.json({ ok: true })
})

// MCP endpoint - route-level CORS with MCP-specific headers
// OAuth discovery for MCP lives in separate Pages Functions at
// functions/.well-known/ because CF Pages only routes paths that match
// filesystem-based Function files — Hono routes under /api/[[route]].ts
// never receive /.well-known/* requests (they fall through to the SPA).
app.use(
	'/api/mcp',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version', 'Authorization'],
		exposeHeaders: ['mcp-session-id', 'mcp-protocol-version', 'WWW-Authenticate']
	})
)

app.all('/api/mcp', async c => {
	const db = createDb(c.env.DB)
	const authHeader = c.req.header('Authorization') ?? null

	// Try Clerk OAuth bearer first (custom connectors via remote MCP), then
	// fall back to personal access tokens (Claude Code CLI etc).
	const user = (await authenticateClerkOAuth(c, db).catch(() => null)) ?? (await authenticateByToken(db, authHeader))

	if (!user) {
		const metadataUrl = new URL(MCP_RESOURCE_METADATA_PATH, c.req.url).toString()
		return new Response(JSON.stringify({ error: 'Unauthorized. Provide a valid bearer token.' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
				'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`
			}
		})
	}
	return handleMcpRequest(c.req.raw, db, user, c.env)
})

app.use(
	'/api/trpc/*',
	trpcServer({
		router: appRouter,
		createContext: async (_opts, c) => {
			const env = c.env
			const db = createDb(env.DB)

			// Check if running in local dev (wrangler sets CF-Connecting-IP to 127.0.0.1 in dev).
			// Must NOT treat missing header as dev — Cloudflare always sets it for external
			// requests, and a missing header fallback would enable X-Dev-User-Email auth bypass.
			const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1'

			let user = null
			try {
				user = await authenticateRequest(c, db, isDev)
			} catch {
				// User remains null, protectedProcedure will throw
			}

			return { db, user, env }
		}
	})
)

export const onRequest: PagesFunction<Env> = async ctx => {
	const executionContext: HonoExecutionContext = {
		...ctx,
		props: {}
	}
	return app.fetch(ctx.request, ctx.env, executionContext)
}
