import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface ServiceWorkerEvent {
	data?: { json: () => unknown }
	notification?: { close: () => void; data?: { url?: unknown } }
	waitUntil: (promise: Promise<unknown>) => void
}

function serviceWorker() {
	const listeners = new Map<string, (event: ServiceWorkerEvent) => void>()
	const showNotification = vi.fn().mockResolvedValue(undefined)
	const openWindow = vi.fn().mockResolvedValue(undefined)
	const source = readFileSync(new URL('../../public/sw-custom.js', import.meta.url), 'utf8')
	runInNewContext(source, {
		URL,
		self: {
			location: { origin: 'https://app.example.test' },
			registration: { showNotification },
			addEventListener: (type: string, listener: (event: ServiceWorkerEvent) => void) =>
				listeners.set(type, listener)
		},
		clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow }
	})
	return { listeners, showNotification, openWindow }
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
})
