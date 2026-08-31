// Custom service worker additions (imported by Workbox-generated SW)

const workoutTimerUrlPattern = /^\/workouts\/sessions\/wks_[0-9a-z]+\/timer$/

function safeNotificationUrl(value) {
	return typeof value === 'string' && workoutTimerUrlPattern.test(value) ? value : '/'
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
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
			for (const client of windowClients) {
				if (client.url.startsWith(self.location.origin) && 'focus' in client) {
					// Route client-side via the app's SW message listener — client.navigate()
					// is a full page load and wipes the in-memory session state
					client.postMessage({ type: 'navigate', url: targetUrl })
					return client.focus()
				}
			}
			return clients.openWindow(absoluteUrl)
		})
	)
})
