// Custom service worker additions (imported by Workbox-generated SW)

self.addEventListener('notificationclick', event => {
	event.notification.close()
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
			for (const client of windowClients) {
				if (client.url.startsWith(self.location.origin) && 'focus' in client) {
					return client.focus()
				}
			}
			return clients.openWindow('/')
		})
	)
})
