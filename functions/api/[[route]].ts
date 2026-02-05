import { trpcServer } from '@hono/trpc-server'
import type { ExecutionContext as HonoExecutionContext } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authenticateRequest } from '../lib/auth'
import { createDb } from '../lib/db'
import { appRouter } from '../lib/router'
import type { Env } from '../lib/trpc'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', cors())

app.use(
	'/api/trpc/*',
	trpcServer({
		router: appRouter,
		createContext: async ({ req }, c) => {
			const env = c.env
			const db = createDb(env.DB)

			let user = null
			try {
				user = await authenticateRequest(req, db)
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
