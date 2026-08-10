/**
 * Strip heavy nested muscle/equipment lists for MCP `verbose: false` reads.
 * Mutates in place so tRPC inferred return types stay identical for the UI.
 */

import {
	type EquipmentRequirement,
	implementCount,
	type SessionSummary,
	type SetType,
	summarizeSessionLogs
} from '@macromaxxing/db'

type ExerciseNest = {
	muscles: unknown[]
	equipment?: EquipmentRequirement[]
}

type LocationNest = {
	equipment?: unknown[]
}

type RowWithExercise = {
	exercise: ExerciseNest
}

type WorkoutNest = {
	exercises: RowWithExercise[]
	location?: unknown
}

type SessionNest = {
	workout?: WorkoutNest | null
	location?: unknown
	logs: RowWithExercise[]
	plannedExercises?: RowWithExercise[]
}

export function stripVerboseExercise(exercise: ExerciseNest): void {
	exercise.muscles = []
	if (Array.isArray(exercise.equipment)) exercise.equipment = []
}

export function stripVerboseLocation(location: unknown): void {
	if (location == null || typeof location !== 'object') return
	if ('equipment' in location && Array.isArray(location.equipment)) {
		location.equipment = []
	}
}

export function stripVerboseRows(rows: readonly RowWithExercise[]): void {
	for (const row of rows) stripVerboseExercise(row.exercise)
}

export function stripVerboseWorkout(workout: WorkoutNest): void {
	stripVerboseRows(workout.exercises)
	stripVerboseLocation(workout.location)
}

/** Full session payload (getSession). */
export function stripVerboseSession(session: SessionNest): void {
	if (session.workout) stripVerboseWorkout(session.workout)
	stripVerboseLocation(session.location)
	stripVerboseRows(session.logs)
	if (session.plannedExercises) stripVerboseRows(session.plannedExercises)
}

type SessionLog = {
	exerciseId: string
	setType: SetType
	weightKg: number
	reps: number
	/**
	 * `equipment` is required, not optional: the summary's volume prices a pair of bells as both,
	 * so a query that forgot the join would silently halve every dumbbell session.
	 */
	exercise: { name: string; muscles: unknown[]; equipment: EquipmentRequirement[] }
}

/**
 * listSessions row shape: attach the per-exercise rollup, and at `verbose: false` drop the raw
 * set rows it replaces. Those rows dominate the payload — each one re-nests the full exercise
 * record — so emptying them is ~85% of the response on real data. Per-set detail lives in
 * getSession; this is a list endpoint.
 *
 * The rollup is computed BEFORE any stripping, which is what lets `verbose: false` keep a correct
 * volume: implement counts come off `exercise.equipment`, and stripping empties that list.
 *
 * Returns a new row, but `location` is shared with the input and stripped in place at
 * `verbose: false` — same contract as the rest of this module. Safe on freshly-fetched query
 * rows (the only caller); do not run it over an array you intend to reuse.
 */
export function toSessionListItem<S extends { logs: SessionLog[]; location?: unknown }>(
	session: S,
	verbose: boolean
): S & { summary: SessionSummary } {
	const item = { ...session, summary: summarizeSessionLogs(withImplementCount(session.logs)) }
	if (!verbose) {
		item.logs = []
		stripVerboseLocation(item.location)
	}
	return item
}

/**
 * Resolve each log's implement count from its exercise's equipment, so the session rollup counts
 * both bells of a dumbbell lift. Kept here rather than in `summarizeSessionLogs` so that pure
 * formula module stays free of equipment knowledge.
 */
export function withImplementCount<L extends SessionLog>(logs: readonly L[]): Array<L & { implementCount: number }> {
	return logs.map(log => ({ ...log, implementCount: implementCount(log.exercise.equipment) }))
}

/** Test/helper wrappers that clone then strip (avoid mutating fixtures). */
export function compactExerciseNesting<E extends ExerciseNest>(exercise: E, verbose: boolean): E {
	if (verbose) return exercise
	const next = {
		...exercise,
		muscles: [] as E['muscles'],
		...(Array.isArray(exercise.equipment) ? { equipment: [] as NonNullable<E['equipment']> } : {})
	}
	return next
}

export function compactLocationNesting<L extends LocationNest>(
	location: L | null | undefined,
	verbose: boolean
): L | null {
	if (location == null) return null
	if (verbose) return location
	return {
		...location,
		...(Array.isArray(location.equipment) ? { equipment: [] as NonNullable<L['equipment']> } : {})
	}
}

export function compactWorkoutPayload<W extends WorkoutNest>(workout: W, verbose: boolean): W {
	if (verbose) return workout
	const clone = structuredClone(workout)
	stripVerboseWorkout(clone)
	return clone
}

export function compactSessionPayload<S extends SessionNest>(session: S, verbose: boolean): S {
	if (verbose) return session
	const clone = structuredClone(session)
	stripVerboseSession(clone)
	return clone
}
