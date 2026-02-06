import { clerkMiddleware } from '@hono/clerk-auth'
import { trpcServer } from '@hono/trpc-server'
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
