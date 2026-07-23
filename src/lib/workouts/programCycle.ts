import type { TypeIDString } from '@macromaxxing/db'

export interface ProgramCycleTemplate {
	id: TypeIDString<'wkt'>
}

export interface ProgramCycleSession {
	workoutId: TypeIDString<'wkt'> | null
	completedAt: number | null
}

export interface ActiveProgramRef {
	id: TypeIDString<'wpr'>
	name: string
	workoutIds: TypeIDString<'wkt'>[]
}

export type ProgramCycleResult<T extends ProgramCycleTemplate> =
	| { kind: 'legacy'; template: T | null }
	| { kind: 'program'; template: T; programName: string; programId: TypeIDString<'wpr'>; day: number; total: number }
	| { kind: 'emptyActiveProgram'; programName: string; programId: TypeIDString<'wpr'> }

/** Legacy cycling: most-recently-completed template advances by one, wrapping. */
function legacyNext<T extends ProgramCycleTemplate>(templates: T[], sessions: ProgramCycleSession[]): T | null {
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
 * `sessions` is expected to be ordered by completedAt desc (the dashboard query
 * already orders this way), but the function only relies on filter/find — it
 * re-sorts in-program completions defensively.
 */
export function pickNextWorkout<T extends ProgramCycleTemplate>(
	templates: T[],
	sessions: ProgramCycleSession[],
	activeProgram: ActiveProgramRef | null
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
	const inProgram = sessions
		.filter(s => s.workoutId !== null && s.completedAt !== null && memberIds.has(s.workoutId))
		.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))

	const total = programTemplates.length
	if (inProgram.length === 0) {
		return {
			kind: 'program',
			template: programTemplates[0],
			programName: activeProgram.name,
			programId: activeProgram.id,
			day: 1,
			total
		}
	}

	const lastWorkoutId = inProgram[0].workoutId
	const lastIdx = programTemplates.findIndex(t => t.id === lastWorkoutId)
	if (lastIdx === -1) {
		return {
			kind: 'program',
			template: programTemplates[0],
			programName: activeProgram.name,
			programId: activeProgram.id,
			day: 1,
			total
		}
	}
	const nextIdx = (lastIdx + 1) % total
	return {
		kind: 'program',
		template: programTemplates[nextIdx],
		programName: activeProgram.name,
		programId: activeProgram.id,
		day: nextIdx + 1,
		total
	}
}
