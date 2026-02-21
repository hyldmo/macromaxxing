import { clerkMiddleware } from '@hono/clerk-auth'
import { trpcServer } from '@hono/trpc-server'
import { recipes, type TypeIDString } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { ExecutionContext as HonoExecutionContext } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authenticateRequest } from '../lib/auth'
import { createDb } from '../lib/db'
import { appRouter } from '../lib/router'

type HonoEnv = { Bindings: Cloudflare.Env }

const app = new Hono<HonoEnv>()

app.use('*', cors())
app.use('*', clerkMiddleware())

// ─── Image Upload/Delete (raw Hono routes, tRPC doesn't support multipart) ───

app.post('/api/recipes/:id/image', async c => {
	const db = createDb(c.env.DB)
	const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1' || !c.req.header('CF-Connecting-IP')
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
	const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1' || !c.req.header('CF-Connecting-IP')
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

app.use(
	'/api/trpc/*',
	trpcServer({
		router: appRouter,
		createContext: async (_opts, c) => {
			const env = c.env
			const db = createDb(env.DB)

			// Check if running in local dev (wrangler sets CF-Connecting-IP to 127.0.0.1 in dev)
			const isDev = c.req.header('CF-Connecting-IP') === '127.0.0.1' || !c.req.header('CF-Connecting-IP')

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
