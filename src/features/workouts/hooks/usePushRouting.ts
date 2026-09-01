import { useEffect } from 'react'
import { useNavigate } from 'react-router'

const ROUTE_CACHE = 'push-route'
const ROUTE_KEY = '/__push-route'
/** A tap routes to the rest that just ended. Minutes later that is a surprise, not a shortcut. */
const PARKED_ROUTE_MS = 120_000

/** The slice of CacheStorage this reads, so a test can stand one up without the DOM. */
export interface RouteCacheStorage {
	open: (name: string) => Promise<{
		match: (key: string) => Promise<{ json: () => Promise<unknown> } | undefined>
		delete: (key: string) => Promise<boolean>
	}>
}

/** Read and consume the route public/sw-custom.js parked for this tap. Reading it spends it. */
export async function takeParkedRoute(cacheStorage: RouteCacheStorage | undefined): Promise<string | null> {
	if (!cacheStorage) return null
	try {
		const cache = await cacheStorage.open(ROUTE_CACHE)
		const hit = await cache.match(ROUTE_KEY)
		if (!hit) return null
		await cache.delete(ROUTE_KEY)
		const parked: unknown = await hit.json()
		if (typeof parked !== 'object' || parked === null) return null
		const url = 'url' in parked ? parked.url : null
		const parkedAt = 'ts' in parked ? parked.ts : null
		if (typeof url !== 'string' || !url.startsWith('/')) return null
		if (typeof parkedAt !== 'number' || Date.now() - parkedAt > PARKED_ROUTE_MS) return null
		return url
	} catch {
		// An unreadable entry is not worth a broken app launch.
		return null
	}
}

/**
 * Route a notification tap, from either half of the handoff in public/sw-custom.js.
 *
 * The posted message is the fast path: it keeps the navigation client-side, so an
 * in-progress session survives the tap. On iOS neither that message nor openWindow's
 * path can be relied on — a backgrounded home-screen app is resumed on the screen it
 * was left on, which is what "tapping the notification does nothing" is. So the worker
 * also parks the target, and the app claims it on the way back to the front, plus once
 * at startup for the cold launch iOS opens at the start URL.
 */
export function usePushRouting(): void {
	const navigate = useNavigate()

	useEffect(() => {
		let live = true
		const claimParked = () => {
			void takeParkedRoute(window.caches).then(url => {
				if (live && url) navigate(url)
			})
		}
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type === 'navigate' && typeof event.data.url === 'string') {
				// Consume the parked copy of this same tap, or it lands twice.
				void takeParkedRoute(window.caches)
				navigate(event.data.url)
			}
		}
		const onVisible = () => {
			if (document.visibilityState === 'visible') claimParked()
		}

		if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage)
		document.addEventListener('visibilitychange', onVisible)
		claimParked()

		return () => {
			live = false
			if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [navigate])
}
