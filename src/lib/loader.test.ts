import { TRPCClientError } from '@trpc/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./trpc', () => ({
	idbReady: Promise.resolve(),
	trpcUtils: {}
}))

import { prefetchRoute } from './loader'

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('prefetchRoute', () => {
	it('does not start API prefetches while offline', async () => {
		vi.stubGlobal('navigator', { onLine: false })
		const build = vi.fn(() => [Promise.reject(new TypeError('Failed to fetch'))])

		await expect(prefetchRoute(build)).resolves.toBeNull()
		expect(build).not.toHaveBeenCalled()
	})

	it('propagates prefetch failures while online', async () => {
		vi.stubGlobal('navigator', { onLine: true })
		const error = new TypeError('Failed to fetch')

		await expect(prefetchRoute(() => [Promise.reject(error)])).rejects.toBe(error)
	})

	it('allows cached route data to render after an API network failure', async () => {
		vi.stubGlobal('navigator', { onLine: true })
		const error = new TRPCClientError('Failed to fetch', { cause: new TypeError('Failed to fetch') })

		await expect(prefetchRoute(() => [Promise.reject(error)])).resolves.toBeNull()
	})
})
