import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../workers/functions/lib/router'

export const trpc = createTRPCReact<AppRouter>()

export type RouterOutput = inferRouterOutputs<AppRouter>

// In local dev, use this email for simulated auth
const DEV_USER_EMAIL = 'dev@localhost'

export function createTRPCClient() {
	return trpc.createClient({
		links: [
			httpBatchLink({
				url: '/api/trpc',
				// Cloudflare Access handles auth via cookies
				fetch(url, options) {
					const headers = new Headers(options?.headers)

					// In local dev, send simulated user email
					if (import.meta.env.DEV) {
						headers.set('X-Dev-User-Email', DEV_USER_EMAIL)
					}

					return fetch(url, { ...options, headers, credentials: 'include' })
				}
			})
		]
	})
}
