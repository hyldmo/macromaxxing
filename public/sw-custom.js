// Custom service worker additions (imported by Workbox-generated SW)

self.addEventListener('notificationclick', event => {
	event.notification.close()
	const targetUrl = event.notification.data?.url || '/'
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
