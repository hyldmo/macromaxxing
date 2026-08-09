import type { TypeIDString } from '@macromaxxing/db'

export interface ProgramCycleTemplate {
	id: TypeIDString<'wkt'>
}

export interface ProgramCycleSession {
	workoutId: TypeIDString<'wkt'> | null
	completedAt: number | null
}

/** A workout the user declared skipped — an anchor event, same as a completed session. */
export interface ProgramSkip {
	workoutId: TypeIDString<'wkt'>
	skippedAt: number
}

export interface ActiveProgramRef {
	id: TypeIDString<'wpr'>
	name: string
	workoutIds: TypeIDString<'wkt'>[]
}

export type ProgramCycleResult<T extends ProgramCycleTemplate> =
	| { kind: 'legacy'; template: T | null }
	| {
			kind: 'program'
			template: T
			programName: string
			programId: TypeIDString<'wpr'>
			day: number
			total: number
			/** Set when a skip (not a session) is what put the cycle here — the row the UI offers to undo. */
			skippedWorkoutId: TypeIDString<'wkt'> | null
	  }
	| { kind: 'emptyActiveProgram'; programName: string; programId: TypeIDString<'wpr'> }

/** Legacy cycling: most-recently-completed template advances by one, wrapping. */
function legacyNext<T extends ProgramCycleTemplate>(
	templates: readonly T[],
	sessions: readonly ProgramCycleSession[]
): T | null {
	if (templates.length === 0) return null
	const last = sessions.find(s => s.completedAt !== null && s.workoutId !== null)
	if (!last) return templates[0]
	const lastIdx = templates.findIndex(t => t.id === last.workoutId)
	if (lastIdx === -1) return templates[0]
	return templates[(lastIdx + 1) % templates.length]
}

/**
 * Pick the next workout to surface on the dashboard.
 *
 * - No active program → legacy cycling across all templates.
 * - Active program with 0 resolvable items → `emptyActiveProgram` (banner case).
 * - Active program with items → cycle within program members; sessions outside
 *   the program are ignored. If the last in-program completion has been removed
 *   from the program since, restart at day 1.
 *
 * A skip anchors the cycle exactly like a completed session does, so the two share
 * one timeline and the later event wins. That is what makes a skip self-clearing:
 * train anything in the program afterwards and the skip stops mattering, with no
 * row to expire or clean up.
 *
 * `sessions` is expected to be ordered by completedAt desc (the dashboard query
 * already orders this way), but the function only relies on filter/find — it
 * re-sorts in-program completions defensively.
 */
export function pickNextWorkout<T extends ProgramCycleTemplate>(
	templates: readonly T[],
	sessions: readonly ProgramCycleSession[],
	activeProgram: ActiveProgramRef | null,
	skips: readonly ProgramSkip[] = []
): ProgramCycleResult<T> {
	if (activeProgram === null) {
		return { kind: 'legacy', template: legacyNext(templates, sessions) }
	}

	if (activeProgram.workoutIds.length === 0) {
		return { kind: 'emptyActiveProgram', programName: activeProgram.name, programId: activeProgram.id }
	}

	const templatesById = new Map(templates.map(t => [t.id, t]))
	const programTemplates: T[] = []
	for (const id of activeProgram.workoutIds) {
		const t = templatesById.get(id)
		if (t) programTemplates.push(t)
	}
	if (programTemplates.length === 0) {
		return { kind: 'emptyActiveProgram', programName: activeProgram.name, programId: activeProgram.id }
	}

	const memberIds = new Set(activeProgram.workoutIds)
	const lastCompletion = sessions
		.filter(s => s.workoutId !== null && s.completedAt !== null && memberIds.has(s.workoutId))
		.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
	const lastSkip = skips.filter(s => memberIds.has(s.workoutId)).sort((a, b) => b.skippedAt - a.skippedAt)[0]

	// One timeline, two kinds of event. A tie goes to the skip — it is the deliberate one.
	const skipWins = lastSkip !== undefined && lastSkip.skippedAt >= (lastCompletion?.completedAt ?? -1)
	const anchorId = skipWins ? lastSkip.workoutId : (lastCompletion?.workoutId ?? null)

	const total = programTemplates.length
	const anchorIdx = anchorId === null ? -1 : programTemplates.findIndex(t => t.id === anchorId)
	// No anchor, or one that has since left the program → start the cycle over.
	const nextIdx = anchorIdx === -1 ? 0 : (anchorIdx + 1) % total

	return {
		kind: 'program',
		template: programTemplates[nextIdx],
		programName: activeProgram.name,
		programId: activeProgram.id,
		day: nextIdx + 1,
		total,
		skippedWorkoutId: skipWins && anchorIdx !== -1 ? lastSkip.workoutId : null
	}
}
