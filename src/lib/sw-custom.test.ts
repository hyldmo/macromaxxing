import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface ServiceWorkerEvent {
	data?: { json: () => unknown }
	notification?: { close: () => void; data?: { url?: unknown } }
	waitUntil: (promise: Promise<unknown>) => void
}

function serviceWorker(
	windowClients: Array<{
		url: string
		focus: () => Promise<unknown>
		postMessage: (message: unknown) => void
	}> = []
) {
	const listeners = new Map<string, (event: ServiceWorkerEvent) => void>()
	const showNotification = vi.fn().mockResolvedValue(undefined)
	const openWindow = vi.fn().mockResolvedValue(undefined)
	const parkRoute = vi.fn().mockResolvedValue(undefined)
	const source = readFileSync(new URL('../../public/sw-custom.js', import.meta.url), 'utf8')
	runInNewContext(source, {
		URL,
		self: {
			location: { origin: 'https://app.example.test' },
			registration: { showNotification },
			addEventListener: (type: string, listener: (event: ServiceWorkerEvent) => void) =>
				listeners.set(type, listener)
		},
		clients: { matchAll: vi.fn().mockResolvedValue(windowClients), openWindow },
		caches: { open: vi.fn().mockResolvedValue({ put: parkRoute }) },
		Response
	})
	return { listeners, showNotification, openWindow, parkRoute }
}

describe('rest push service worker', () => {
	it('shows only the fixed notification copy for a valid payload', async () => {
		const worker = serviceWorker()
		let completion: Promise<unknown> = Promise.resolve()
		worker.listeners.get('push')?.({
			data: {
				json: () => ({
					version: 1,
					restId: 'rnj_rest',
					url: '/workouts/sessions/wks_session/timer',
					body: 'untrusted copy'
				})
			},
			waitUntil: promise => {
				completion = promise
			}
		})
		await completion

		expect(worker.showNotification).toHaveBeenCalledWith('Rest complete', {
			body: 'Time for your next set.',
			tag: 'rnj_rest',
			icon: '/pwa-192x192.png',
			data: { url: '/workouts/sessions/wks_session/timer' }
		})
	})

	it('ignores malformed and unsafe push payloads', () => {
		const worker = serviceWorker()
		const push = worker.listeners.get('push')
		push?.({ data: { json: () => ({ version: 2, restId: 'rnj_rest', url: null }) }, waitUntil: vi.fn() })
		push?.({
			data: { json: () => ({ version: 1, restId: 'rnj_rest', url: 'https://evil.example.test' }) },
			waitUntil: vi.fn()
		})
		push?.({
			data: {
				json: () => {
					throw new Error('bad json')
				}
			},
			waitUntil: vi.fn()
		})

		expect(worker.showNotification).not.toHaveBeenCalled()
	})

	it('falls back to the app root for unsafe click targets', async () => {
		const worker = serviceWorker()
		let completion: Promise<unknown> = Promise.resolve()
		worker.listeners.get('notificationclick')?.({
			notification: { close: vi.fn(), data: { url: 'https://evil.example.test' } },
			waitUntil: promise => {
				completion = promise
			}
		})
		await completion

		expect(worker.openWindow).toHaveBeenCalledWith('https://app.example.test/')
	})

	it('focuses an existing app window and sends it a safe client-side route', async () => {
		const client = {
			url: 'https://app.example.test/workouts',
			focus: vi.fn().mockResolvedValue(undefined),
			postMessage: vi.fn()
		}
		const worker = serviceWorker([client])
		const close = vi.fn()
		let completion: Promise<unknown> = Promise.resolve()
		worker.listeners.get('notificationclick')?.({
			notification: { close, data: { url: '/workouts/sessions/wks_session/timer' } },
			waitUntil: promise => {
				completion = promise
			}
		})
		await completion

		expect(close).toHaveBeenCalledOnce()
		expect(client.postMessage).toHaveBeenCalledWith({
			type: 'navigate',
			url: '/workouts/sessions/wks_session/timer'
		})
		expect(client.focus).toHaveBeenCalledOnce()
		expect(worker.openWindow).not.toHaveBeenCalled()
	})

	it('parks the route so a tap survives iOS resuming the app where it left off', async () => {
		const client = {
			url: 'https://app.example.test/settings',
			focus: vi.fn().mockRejectedValue(new Error('focus refused')),
			postMessage: vi.fn()
		}
		const worker = serviceWorker([client])
		let completion: Promise<unknown> = Promise.resolve()
		worker.listeners.get('notificationclick')?.({
			notification: { close: vi.fn(), data: { url: '/workouts/sessions/wks_session/timer' } },
			waitUntil: promise => {
				completion = promise
			}
		})
		await completion

		const [key, parked] = worker.parkRoute.mock.calls[0]
		expect(key).toBe('/__push-route')
		expect(await parked.json()).toMatchObject({ url: '/workouts/sessions/wks_session/timer' })
		expect(client.postMessage).toHaveBeenCalledOnce()
	})

	it('parks nothing when the tap has no destination beyond the app root', async () => {
		const worker = serviceWorker()
		let completion: Promise<unknown> = Promise.resolve()
		worker.listeners.get('notificationclick')?.({
			notification: { close: vi.fn(), data: { url: null } },
			waitUntil: promise => {
				completion = promise
			}
		})
		await completion

		expect(worker.parkRoute).not.toHaveBeenCalled()
		expect(worker.openWindow).toHaveBeenCalledWith('https://app.example.test/')
	})
})
