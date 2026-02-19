import { useReducer } from 'react'
import type { FlatSet } from '../utils/sets'

export interface TimerState {
	queue: FlatSet[]
	/** Queue indices confirmed locally this session (ordered, for undo) */
	locallyConfirmed: number[]
	/** Index into queue for the current/next set (-1 = all done) */
	currentIndex: number
	editWeight: number | null
	editReps: number
	setStartedAt: number | null
	isPaused: boolean
}

export type TimerAction =
	| { type: 'INIT'; sets: FlatSet[] }
	| { type: 'CONFIRM' }
	| { type: 'UNDO' }
	| { type: 'EDIT_WEIGHT'; weight: number | null }
	| { type: 'EDIT_REPS'; reps: number }
	| { type: 'START_SET' }
	| { type: 'PAUSE' }
	| { type: 'RESUME'; elapsedMs: number }
	| { type: 'STOP_SET' }
	| { type: 'NAVIGATE'; direction: -1 | 1 }

function isDone(queue: FlatSet[], index: number, locallyConfirmed: number[]): boolean {
	return queue[index].completed || locallyConfirmed.includes(index)
}

function findNextPending(queue: FlatSet[], from: number, locallyConfirmed: number[]): number {
	for (let i = from; i < queue.length; i++) {
		if (!isDone(queue, i, locallyConfirmed)) return i
	}
	return -1
}

function loadSet(queue: FlatSet[], index: number): Pick<TimerState, 'editWeight' | 'editReps'> {
	if (index < 0 || index >= queue.length) return { editWeight: null, editReps: 0 }
	return { editWeight: queue[index].weightKg, editReps: queue[index].reps }
}

function timerReducer(state: TimerState, action: TimerAction): TimerState {
	switch (action.type) {
		case 'INIT': {
			const cursor = findNextPending(action.sets, 0, [])
			return {
				queue: action.sets,
				locallyConfirmed: [],
				currentIndex: cursor,
				...loadSet(action.sets, cursor),
				setStartedAt: null,
				isPaused: false
			}
		}
		case 'CONFIRM': {
			if (state.currentIndex < 0) return state
			const confirmed = [...state.locallyConfirmed, state.currentIndex]
			const next = findNextPending(state.queue, 0, confirmed)
			return {
				...state,
				locallyConfirmed: confirmed,
				currentIndex: next,
				...loadSet(state.queue, next),
				setStartedAt: null,
				isPaused: false
			}
		}
		case 'UNDO': {
			if (state.locallyConfirmed.length === 0) return state
			const confirmed = state.locallyConfirmed.slice(0, -1)
			const restored = state.locallyConfirmed.at(-1)!
			return {
				...state,
				locallyConfirmed: confirmed,
				currentIndex: restored,
				...loadSet(state.queue, restored),
				setStartedAt: null,
				isPaused: false
			}
		}
		case 'EDIT_WEIGHT':
			return { ...state, editWeight: action.weight }
		case 'EDIT_REPS':
			return { ...state, editReps: action.reps }
		case 'START_SET':
			return { ...state, setStartedAt: Date.now(), isPaused: false }
		case 'PAUSE':
			return { ...state, isPaused: true }
		case 'RESUME':
			return { ...state, setStartedAt: Date.now() - action.elapsedMs, isPaused: false }
		case 'STOP_SET':
			return { ...state, setStartedAt: null, isPaused: false }
		case 'NAVIGATE': {
			if (state.currentIndex < 0) return state
			const currentItemIdx = state.queue[state.currentIndex].itemIndex
			let target = -1
			if (action.direction === 1) {
				for (let i = 0; i < state.queue.length; i++) {
					if (!isDone(state.queue, i, state.locallyConfirmed) && state.queue[i].itemIndex > currentItemIdx) {
						target = i
						break
					}
				}
			} else {
				for (let i = 0; i < state.queue.length; i++) {
					if (!isDone(state.queue, i, state.locallyConfirmed) && state.queue[i].itemIndex < currentItemIdx) {
						target = i
					}
				}
			}
			if (target < 0) return state
			return {
				...state,
				currentIndex: target,
				...loadSet(state.queue, target),
				setStartedAt: null,
				isPaused: false
			}
		}
	}
}

const INITIAL_STATE: TimerState = {
	queue: [],
	locallyConfirmed: [],
	currentIndex: -1,
	editWeight: null,
	editReps: 0,
	setStartedAt: null,
	isPaused: false
}

export function useTimerState() {
	return useReducer(timerReducer, INITIAL_STATE)
}
