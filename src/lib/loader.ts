import { TRPCClientError } from '@trpc/client'
import { idbReady, trpcUtils } from './trpc'

function isNetworkFailure(error: unknown): boolean {
	return error instanceof TRPCClientError && error.cause instanceof TypeError
}

export async function prefetchRoute(build: (utils: typeof trpcUtils) => Array<Promise<unknown>>): Promise<null> {
	await idbReady
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return null

	const results = await Promise.allSettled(build(trpcUtils))
	for (const r of results) {
		if (r.status === 'rejected') {
			const err = r.reason
			if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') continue
			if (isNetworkFailure(err)) continue
			throw err
		}
	}
	return null
}
