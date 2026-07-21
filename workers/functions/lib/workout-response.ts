/**
 * Strip heavy nested muscle/equipment lists for MCP `verbose: false` reads.
 * Mutates in place so tRPC inferred return types stay identical for the UI.
 */

type ExerciseNest = {
	muscles: unknown[]
	equipment?: unknown[]
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

/** listSessions: workout is un-nested; only logs carry repeated exercise muscles. */
export function stripVerboseSessionListItem(session: { logs: RowWithExercise[]; location?: unknown }): void {
	stripVerboseRows(session.logs)
	stripVerboseLocation(session.location)
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
