import type { Exercise } from '@macromaxxing/db'
import type { FlatSet, SessionLog } from './sets'

/**
 * Stable identity of a planned set in the timer queue. Survives reorders and
 * unrelated template edits, unlike an index into a queue snapshot.
 */
export interface SetCursor {
	exerciseId: Exercise['id']
	setNumber: number
}

export const cursorOf = (set: Pick<FlatSet, 'exerciseId' | 'setNumber'>): SetCursor => ({
	exerciseId: set.exerciseId,
	setNumber: set.setNumber
})

export const cursorEquals = (a: SetCursor | null, b: SetCursor | null): boolean =>
	a === b || (a !== null && b !== null && a.exerciseId === b.exerciseId && a.setNumber === b.setNumber)

export const cursorIndex = (queue: FlatSet[], cursor: SetCursor | null): number =>
	cursor === null ? -1 : queue.findIndex(s => s.exerciseId === cursor.exerciseId && s.setNumber === cursor.setNumber)

/** First pending (unlogged) set at or after `from`; -1 if none. */
export function nextPendingIndex(queue: FlatSet[], from = 0): number {
	for (let i = Math.max(0, from); i < queue.length; i++) {
		if (!queue[i].completed) return i
	}
	return -1
}

/**
 * Resolve the stored cursor against the live queue. A cursor that still exists is
 * kept even when its set is completed (post-confirm rest review, deliberate
 * browsing); a null or dangling cursor (set removed by a template edit) falls to
 * the first pending set. -1 = every planned set is logged.
 */
export function resolveCursorIndex(queue: FlatSet[], cursor: SetCursor | null): number {
	const idx = cursorIndex(queue, cursor)
	return idx >= 0 ? idx : nextPendingIndex(queue)
}

/**
 * Next pending set after `from`, wrapping once to the start. `exclude` skips a
 * specific index — the set just confirmed, whose optimistic log may not have
 * landed yet. -1 = none.
 */
export function nextPendingWrapped(queue: FlatSet[], from: number, exclude = -1): number {
	const ahead = nextPendingIndex(queue, from + 1)
	if (ahead >= 0) return ahead
	const wrapped = nextPendingIndex(queue)
	return wrapped === exclude ? -1 : wrapped
}

/**
 * Pending set in a different exercise group: dir=1 → first set of a later group,
 * dir=-1 → last pending set of an earlier group. -1 = none.
 */
export function nextExercisePendingIndex(queue: FlatSet[], fromIndex: number, direction: -1 | 1): number {
	const current = queue[fromIndex]?.itemIndex
	if (current === undefined) return -1
	let target = -1
	for (let i = 0; i < queue.length; i++) {
		if (queue[i].completed) continue
		if (direction === 1) {
			if (queue[i].itemIndex > current) return i
		} else if (queue[i].itemIndex < current) {
			target = i
		}
	}
	return target
}

/**
 * Outcome of confirming the set at `index`: a mid-superset transition advances to
 * the next pending set (excluding the just-confirmed one, whose optimistic log
 * may not have landed yet); a solo or round-ending set holds the cursor and
 * starts rest.
 */
export type ConfirmOutcome = { action: 'advance'; next: SetCursor | null } | { action: 'rest' }

export function confirmOutcome(queue: FlatSet[], index: number): ConfirmOutcome {
	if (!queue[index]?.transition) return { action: 'rest' }
	const next = nextPendingWrapped(queue, index, index)
	return { action: 'advance', next: next >= 0 ? cursorOf(queue[next]) : null }
}

/**
 * Cursor move after dismissing rest at `index`: advance off a completed set to
 * the next pending one; stay parked on a pending set — dismissing a
 * checklist-started rest must not skip a set that was never performed.
 */
export type DismissOutcome = { advance: true; next: SetCursor | null } | { advance: false }

export function dismissOutcome(queue: FlatSet[], index: number): DismissOutcome {
	if (index < 0 || !queue[index]?.completed) return { advance: false }
	const next = nextPendingWrapped(queue, index)
	return { advance: true, next: next >= 0 ? cursorOf(queue[next]) : null }
}

/**
 * Cursor for undoing `logId`: the queue slot the removed log frees up, or null
 * when the log lives outside the queue (ad-hoc extra exercise).
 */
export function undoCursor(queue: FlatSet[], logId: SessionLog['id']): SetCursor | null {
	const idx = queue.findIndex(s => s.log?.id === logId)
	return idx >= 0 ? cursorOf(queue[idx]) : null
}
