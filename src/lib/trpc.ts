import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../workers/functions/lib/router'

export const trpc = createTRPCReact<AppRouter>()

export type RouterOutput = inferRouterOutputs<AppRouter>

export function createTRPCClient() {
	return trpc.createClient({
		links: [
			httpBatchLink({
				url: '/api/trpc',
				fetch(url, options) {
					return fetch(url, { ...options, credentials: 'include' })
				}
			})
		]
	})
}
