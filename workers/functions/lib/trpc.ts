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

export interface McpMeta {
	description: string
	/** Override the default `readOnlyHint` (defaults to `true` for queries, `false` for mutations). */
	readOnly?: boolean
	/** Override the default `destructiveHint` (defaults to `true` for `delete*`/`remove*` mutations). */
	destructive?: boolean
	/** Set the `idempotentHint`. No default — leave unset unless the procedure is genuinely idempotent. */
	idempotent?: boolean
	/** Set the `openWorldHint`. Defaults to `false` (all our procedures touch our own DB only). */
	openWorld?: boolean
}

const t = initTRPC.context<TRPCContext>().meta<McpMeta>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.user) {
		throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
	}
	return next({ ctx: { ...ctx, user: ctx.user } })
})
