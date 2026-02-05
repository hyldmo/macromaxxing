/** biome-ignore-all lint/suspicious/noTsIgnore: Cloudflare.Env sometimes marks this line as erroring in CLI runs but it will catch in production builds */
import { initTRPC, TRPCError } from '@trpc/server'
import type { AuthUser } from './auth'
import type { Database } from './db'

export interface TRPCContext {
	db: Database
	user: AuthUser | null
	// @ts-ignore
	env: Cloudflare.Env
}

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.user) {
		throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
	}
	return next({ ctx: { ...ctx, user: ctx.user } })
})
