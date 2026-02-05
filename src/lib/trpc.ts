import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../functions/lib/router'
import { getUserId } from './user'

export const trpc = createTRPCReact<AppRouter>()

export type RouterOutput = inferRouterOutputs<AppRouter>

export function createTRPCClient() {
	return trpc.createClient({
		links: [
			httpBatchLink({
				url: '/api/trpc',
				headers: () => ({
					'X-User-ID': getUserId()
				})
			})
		]
	})
}
