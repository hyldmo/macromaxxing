import { persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/query-persist-client-core'
import { QueryClient } from '@tanstack/react-query'
import { createTRPCQueryUtils, createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../workers/functions/lib/router'
import { createIDBPersister } from './query-persist'

export const trpc = createTRPCReact<AppRouter>()

export type RouterOutput = inferRouterOutputs<AppRouter>

const ONE_DAY = 1000 * 60 * 60 * 24

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: ONE_DAY,
			staleTime: 1000 * 60 * 5,
			networkMode: 'offlineFirst'
		},
		mutations: {
			networkMode: 'offlineFirst'
		}
	}
})

export const trpcClient = trpc.createClient({
	links: [
		httpBatchLink({
			url: '/api/trpc',
			fetch(url, options) {
				return fetch(url, { ...options, credentials: 'include' })
			}
		})
	]
})

export const trpcUtils = createTRPCQueryUtils({ queryClient, client: trpcClient })

export const idbReady: Promise<void> = import.meta.env.SSR
	? Promise.resolve()
	: (async () => {
			const persister = createIDBPersister()
			await persistQueryClientRestore({ queryClient, persister, maxAge: ONE_DAY })
			persistQueryClientSubscribe({ queryClient, persister })
		})()
