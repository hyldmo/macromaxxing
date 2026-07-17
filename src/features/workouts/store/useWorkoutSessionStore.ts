import type { SetType } from '@macromaxxing/db'
import { create } from 'zustand'
import { cursorEquals, type SetCursor } from '~/lib'

/**
 * Ephemeral workout-session state that cannot be derived from server data.
 *
 * The set queue itself is NEVER stored here — timer mode derives it from the live
 * session query (`flattenSets(exerciseGroups)`) on every render, so template
 * edits, reorders, and checklist-mode logging stay in sync. The store only keeps
 * the user's position (`cursor`, stable set identity — not an index), uncommitted
 * edits, and running timers.
 */
export interface WorkoutSessionStore {
	sessionId: string | null
	sessionStartedAt: number | null

	/** Position in the workout. Resolved against the live queue at render via `resolveCursorIndex`. */
	cursor: SetCursor | null
	/** Uncommitted weight/reps edits for the cursor set. Absent field = show the live planned value. */
	draft: { weight?: number | null; reps?: number }

	/** Stopwatch for the set being performed. `pausedAt` set = paused. */
	setTimer: { startedAt: number; pausedAt: number | null } | null

	rest: {
		startedAt: number
		endAt: number
		total: number
		setType: SetType
	} | null

	/** When the current superset round began (first transition confirm) — credits transition time against the next rest. */
	roundStartedAt: number | null

	// Session lifecycle
	setSession: (session: { id: string; startedAt?: number } | null) => void
	reset: () => void

	// Cursor + per-set edit state
	setCursor: (cursor: SetCursor | null) => void
	setDraft: (cursor: SetCursor, patch: Partial<{ weight: number | null; reps: number }>) => void

	// Set stopwatch
	startSet: (cursor: SetCursor) => void
	pauseSet: () => void
	resumeSet: () => void
	stopSet: () => void

	// Rest timer
	startRest: (durationSec: number, setType: SetType) => void
	recordTransition: () => void
	dismissRest: () => void
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
	cursor: null as SetCursor | null,
	draft: {} as WorkoutSessionStore['draft'],
	setTimer: null as WorkoutSessionStore['setTimer'],
	rest: null as WorkoutSessionStore['rest'],
	roundStartedAt: null as number | null
}

/** Everything scoped to the previous set is invalid once the cursor moves. */
const movedCursor = (cursor: SetCursor | null) => ({
	cursor,
	draft: {},
	setTimer: null as WorkoutSessionStore['setTimer']
})

// --- Store ---

export const useWorkoutSessionStore = create<WorkoutSessionStore>((set, get) => ({
	...INITIAL_STATE,

	setSession: session => {
		if (session === null) {
			clearNotificationTimeout()
			set({ ...INITIAL_STATE })
			return
		}
		const startedAt = session.startedAt !== undefined ? { sessionStartedAt: session.startedAt } : {}
		const current = get().sessionId
		if (current !== null && current !== session.id) {
			// Different session: cursor, edits, and timers belong to the old one
			clearNotificationTimeout()
			set({ ...INITIAL_STATE, sessionId: session.id, ...startedAt })
		} else {
			set({ sessionId: session.id, ...startedAt })
		}
	},

	reset: () => {
		clearNotificationTimeout()
		set({ ...INITIAL_STATE })
	},

	// --- Cursor + per-set edit state ---

	setCursor: cursor => {
		set(movedCursor(cursor))
	},

	setDraft: (cursor, patch) => {
		set(s =>
			cursorEquals(s.cursor, cursor)
				? { draft: { ...s.draft, ...patch } }
				: // Cursor drifted (e.g. the set was removed by a plan edit): snap to the
					// set actually being edited, keeping the running stopwatch.
					{ ...movedCursor(cursor), draft: { ...patch }, setTimer: s.setTimer }
		)
	},

	// --- Set stopwatch ---

	startSet: cursor => {
		set(s => ({
			...(cursorEquals(s.cursor, cursor) ? {} : { cursor, draft: {} }),
			setTimer: { startedAt: Date.now(), pausedAt: null }
		}))
	},

	pauseSet: () => {
		set(s =>
			s.setTimer && s.setTimer.pausedAt === null ? { setTimer: { ...s.setTimer, pausedAt: Date.now() } } : {}
		)
	},

	resumeSet: () => {
		set(s => {
			if (!s.setTimer || s.setTimer.pausedAt === null) return {}
			// Shift the start forward by the paused span so elapsed excludes it
			return {
				setTimer: { startedAt: s.setTimer.startedAt + (Date.now() - s.setTimer.pausedAt), pausedAt: null }
			}
		})
	},

	stopSet: () => {
		set({ setTimer: null })
	},

	// --- Rest timer ---

	startRest: (durationSec, setType) => {
		clearNotificationTimeout()

		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission()
		}

		const state = get()
		const now = Date.now()

		// Subtract elapsed superset transition time from the countdown — but keep `total`
		// equal to the full duration and backdate `startedAt` so the "rested" readout
		// (total - remaining) reflects time already elapsed during the round.
		const roundElapsedMs = state.roundStartedAt !== null ? Math.max(0, now - state.roundStartedAt) : 0
		const remainingMs = Math.max(0, durationSec * 1000 - roundElapsedMs)
		const endAt = now + remainingMs

		scheduleNotification(endAt, state.sessionId)

		set({
			rest: { startedAt: now - roundElapsedMs, endAt, total: durationSec, setType },
			roundStartedAt: null
		})
	},

	recordTransition: () => {
		set(s => ({
			roundStartedAt: s.roundStartedAt ?? Date.now()
		}))
	},

	dismissRest: () => {
		clearNotificationTimeout()
		set({ rest: null, roundStartedAt: null })
	}
}))
