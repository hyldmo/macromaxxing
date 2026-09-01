// Custom service worker additions (imported by Workbox-generated SW)

const workoutTimerUrlPattern = /^\/workouts\/sessions\/wks_[0-9a-z]+\/timer$/

function safeNotificationUrl(value) {
	return typeof value === 'string' && workoutTimerUrlPattern.test(value) ? value : '/'
}

// A tap has to survive how iOS resumes a backgrounded home-screen app: it comes back on
// the screen it was left on, `openWindow`'s path is ignored, and a `postMessage` to a
// frozen page is dropped. Cache Storage outlives both, so the target is parked here and
// the app claims it on the way back to the front (usePushRouting).
const ROUTE_CACHE = 'push-route'
const ROUTE_KEY = '/__push-route'

/** One entry, overwritten per tap: only the newest tap can still be waiting to land. */
async function parkRoute(url) {
	try {
		const cache = await caches.open(ROUTE_CACHE)
		await cache.put(ROUTE_KEY, new Response(JSON.stringify({ url, ts: Date.now() })))
	} catch {
		// Storage refused it (quota, private browsing). The two direct routes below still stand.
	}
}

self.addEventListener('push', event => {
	let payload
	try {
		payload = event.data?.json()
	} catch {
		return
	}
	if (
		payload?.version !== 1 ||
		typeof payload.restId !== 'string' ||
		!payload.restId.startsWith('rnj_') ||
		!(payload.url === null || (typeof payload.url === 'string' && workoutTimerUrlPattern.test(payload.url)))
	) {
		return
	}

	event.waitUntil(
		self.registration.showNotification('Rest complete', {
			body: 'Time for your next set.',
			tag: payload.restId,
			icon: '/pwa-192x192.png',
			data: { url: safeNotificationUrl(payload.url) }
		})
	)
})

self.addEventListener('notificationclick', event => {
	event.notification.close()
	const targetUrl = safeNotificationUrl(event.notification.data?.url)
	const absoluteUrl = new URL(targetUrl, self.location.origin).href

	event.waitUntil(
		(async () => {
			// Park before anything else: every route below can report success and still
			// leave the phone on the screen it was already showing. Only a real
			// destination is worth parking; the root is where an untargeted tap lands anyway.
			if (targetUrl !== '/') await parkRoute(targetUrl)

			const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
			for (const client of windowClients) {
				if (!client.url.startsWith(self.location.origin)) continue
				// Route client-side via the app's SW message listener — client.navigate()
				// is a full page load and wipes the in-memory session state
				client.postMessage({ type: 'navigate', url: targetUrl })
				try {
					await client.focus()
				} catch {
					// focus() can be refused without user activation; the parked route covers it.
				}
				return
			}
			await clients.openWindow(absoluteUrl)
		})()
	)
})
