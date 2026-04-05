import type { Exercise, SetType } from '@macromaxxing/db'
import { create } from 'zustand'
import type { FlatSet } from '~/lib'

export interface MutationData {
	exerciseId: Exercise['id']
	weightKg: number
	reps: number
	setType: SetType
	transition: boolean
}

export interface WorkoutSessionStore {
	sessionId: string | null
	sessionStartedAt: number | null

	queue: FlatSet[]
	confirmedIndices: number[]

	active: {
		index: number
		weight: number | null
		reps: number
		logId: string | null
		setTimer: { startedAt: number; isPaused: boolean } | null
	} | null

	rest: {
		startedAt: number
		endAt: number
		total: number
		setType: SetType
	} | null

	_roundStartedAt: number | null

	// Session lifecycle
	setSession: (session: { id: string; startedAt?: number } | null) => void
	init: (sessionId: string, startedAt: number, sets: FlatSet[]) => void
	reset: () => void

	// Set confirmation (timer mode)
	confirmSet: () => MutationData | null
	setLogId: (id: string) => void
	undo: () => void

	// Active set editing
	editWeight: (w: number | null) => void
	editReps: (r: number) => void

	// Set timer control
	startSet: () => void
	pauseSet: () => void
	resumeSet: (elapsedMs: number) => void
	stopSet: () => void

	// Rest timer
	startRest: (durationSec: number, setType: SetType) => void
	recordTransition: () => void
	dismissRest: () => void

	// Navigation
	navigate: (direction: -1 | 1) => void
}

// --- Helpers ---

function isDone(queue: FlatSet[], index: number, confirmedIndices: number[]): boolean {
	return queue[index].completed || confirmedIndices.includes(index)
}

function findNextPending(queue: FlatSet[], from: number, confirmedIndices: number[]): number {
	for (let i = from; i < queue.length; i++) {
		if (!isDone(queue, i, confirmedIndices)) return i
	}
	return -1
}

function loadActive(queue: FlatSet[], index: number): WorkoutSessionStore['active'] {
	if (index < 0 || index >= queue.length) return null
	return {
		index,
		weight: queue[index].weightKg,
		reps: queue[index].reps,
		logId: null,
		setTimer: null
	}
}

// --- Notification ---

function fireNotification(sessionId: string | null) {
	if (navigator.vibrate) navigator.vibrate(200)
	if ('Notification' in window && Notification.permission === 'granted') {
		const timerUrl = sessionId ? `/workouts/sessions/${sessionId}/timer` : '/'
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.ready.then(reg => {
				reg.showNotification('Rest timer done', {
					body: 'Time for your next set',
					tag: 'rest-timer',
					icon: '/pwa-192x192.png',
					data: { url: timerUrl }
				})
			})
		} else {
			new Notification('Rest timer done', { body: 'Time for your next set', tag: 'rest-timer' })
		}
	}
}

// Notification timeout — scheduled when rest starts, cleared on dismiss/reset
let notificationTimeoutId: ReturnType<typeof setTimeout> | null = null

function clearNotificationTimeout() {
	if (notificationTimeoutId !== null) {
		clearTimeout(notificationTimeoutId)
		notificationTimeoutId = null
	}
}

function scheduleNotification(endAt: number, sessionId: string | null) {
	clearNotificationTimeout()
	const delay = endAt - Date.now()
	if (delay > 0) {
		notificationTimeoutId = setTimeout(() => {
			fireNotification(sessionId)
			notificationTimeoutId = null
		}, delay)
	} else {
		fireNotification(sessionId)
	}
}

// --- Initial state ---

const INITIAL_STATE = {
	sessionId: null as string | null,
	sessionStartedAt: null as number | null,
	queue: [] as FlatSet[],
	confirmedIndices: [] as number[],
	active: null as WorkoutSessionStore['active'],
	rest: null as WorkoutSessionStore['rest'],
	_roundStartedAt: null as number | null
}

// --- Store ---

export const useWorkoutSessionStore = create<WorkoutSessionStore>((set, get) => ({
	...INITIAL_STATE,

	setSession: session => {
		if (session === null) {
			clearNotificationTimeout()
			set({ ...INITIAL_STATE })
		} else {
			set({
				sessionId: session.id,
				...(session.startedAt !== undefined && { sessionStartedAt: session.startedAt })
			})
		}
	},

	init: (sessionId, startedAt, sets) => {
		const existing = get()
		// Preserve rest timer if one is running (e.g., started in checklist mode)
		if (!existing.rest) clearNotificationTimeout()
		const cursor = findNextPending(sets, 0, [])
		set({
			...INITIAL_STATE,
			sessionId,
			sessionStartedAt: startedAt,
			queue: sets,
			active: loadActive(sets, cursor),
			rest: existing.rest
		})
	},

	reset: () => {
		clearNotificationTimeout()
		set({ ...INITIAL_STATE })
	},

	// --- Set confirmation (timer mode) ---

	confirmSet: () => {
		const state = get()
		if (!state.active) return null

		const { index, weight, reps } = state.active
		const flatSet = state.queue[index]
		const confirmed = [...state.confirmedIndices, index]

		const data: MutationData = {
			exerciseId: flatSet.exerciseId,
			weightKg: weight ?? 0,
			reps,
			setType: flatSet.setType,
			transition: flatSet.transition
		}

		if (flatSet.transition) {
			// Mid-superset: record round start, advance cursor immediately, auto-start next set timer
			let next = findNextPending(state.queue, index + 1, confirmed)
			if (next < 0) next = findNextPending(state.queue, 0, confirmed)
			const nextActive = loadActive(state.queue, next)

			set({
				confirmedIndices: confirmed,
				active: nextActive ? { ...nextActive, setTimer: { startedAt: Date.now(), isPaused: false } } : null,
				_roundStartedAt: state._roundStartedAt ?? Date.now()
			})
		} else {
			// Solo or last in superset round: keep cursor on confirmed set, start rest
			set({
				confirmedIndices: confirmed,
				active: {
					index,
					weight,
					reps,
					logId: null,
					setTimer: null
				}
			})
		}

		return data
	},

	setLogId: id => {
		set(s => {
			if (!s.active) return {}
			return { active: { ...s.active, logId: id } }
		})
	},

	undo: () => {
		const state = get()
		if (state.confirmedIndices.length === 0) return
		clearNotificationTimeout()

		const confirmed = state.confirmedIndices.slice(0, -1)
		const restored = state.confirmedIndices.at(-1)!

		set({
			confirmedIndices: confirmed,
			active: loadActive(state.queue, restored),
			rest: null
		})
	},

	// --- Active set editing ---

	editWeight: w => {
		set(s => {
			if (!s.active) return {}
			return { active: { ...s.active, weight: w } }
		})
	},

	editReps: r => {
		set(s => {
			if (!s.active) return {}
			return { active: { ...s.active, reps: r } }
		})
	},

	// --- Set timer control ---

	startSet: () => {
		set(s => {
			if (!s.active) return {}
			return {
				active: { ...s.active, setTimer: { startedAt: Date.now(), isPaused: false } }
			}
		})
	},

	pauseSet: () => {
		set(s => {
			if (!s.active?.setTimer) return {}
			return { active: { ...s.active, setTimer: { ...s.active.setTimer, isPaused: true } } }
		})
	},

	resumeSet: elapsedMs => {
		set(s => {
			if (!s.active?.setTimer) return {}
			return {
				active: {
					...s.active,
					setTimer: { startedAt: Date.now() - elapsedMs, isPaused: false }
				}
			}
		})
	},

	stopSet: () => {
		set(s => {
			if (!s.active) return {}
			return { active: { ...s.active, setTimer: null } }
		})
	},

	// --- Rest timer ---

	startRest: (durationSec, setType) => {
		clearNotificationTimeout()

		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission()
		}

		const state = get()

		// Subtract elapsed superset transition time
		let adjusted = durationSec
		if (state._roundStartedAt !== null) {
			const elapsed = Math.floor((Date.now() - state._roundStartedAt) / 1000)
			adjusted = Math.max(0, durationSec - elapsed)
		}

		const now = Date.now()
		const endAt = now + adjusted * 1000

		scheduleNotification(endAt, state.sessionId)

		set({
			rest: { startedAt: now, endAt, total: adjusted, setType },
			_roundStartedAt: null
		})
	},

	recordTransition: () => {
		set(s => ({
			_roundStartedAt: s._roundStartedAt ?? Date.now()
		}))
	},

	dismissRest: () => {
		const state = get()
		clearNotificationTimeout()

		// Advance cursor to next pending set
		const confirmed = state.confirmedIndices
		const fromIndex = state.active ? state.active.index + 1 : 0
		let next = findNextPending(state.queue, fromIndex, confirmed)
		if (next < 0) next = findNextPending(state.queue, 0, confirmed)

		set({
			rest: null,
			_roundStartedAt: null,
			active: loadActive(state.queue, next)
		})
	},

	// --- Navigation ---

	navigate: direction => {
		const state = get()
		if (!state.active) return
		const currentItemIdx = state.queue[state.active.index].itemIndex
		let target = -1

		if (direction === 1) {
			for (let i = 0; i < state.queue.length; i++) {
				if (!isDone(state.queue, i, state.confirmedIndices) && state.queue[i].itemIndex > currentItemIdx) {
					target = i
					break
				}
			}
		} else {
			for (let i = 0; i < state.queue.length; i++) {
				if (!isDone(state.queue, i, state.confirmedIndices) && state.queue[i].itemIndex < currentItemIdx) {
					target = i
				}
			}
		}

		if (target < 0) return
		set({ active: loadActive(state.queue, target) })
	}
}))
