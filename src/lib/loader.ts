import { TRPCClientError } from '@trpc/client'
import { idbReady, trpcUtils } from './trpc'

export async function prefetchRoute(build: (utils: typeof trpcUtils) => Array<Promise<unknown>>): Promise<null> {
	await idbReady
	const results = await Promise.allSettled(build(trpcUtils))
	for (const r of results) {
		if (r.status === 'rejected') {
			const err = r.reason
			if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') continue
			throw err
		}
	}
	return null
}
