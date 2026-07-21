import type { SetMode, TrainingGoal, TypeIDString } from '@macromaxxing/db'

export interface ExistingWorkoutExerciseRow {
	id: TypeIDString<'wke'>
	exerciseId: TypeIDString<'exc'>
	targetSets: number | null
	targetReps: number | null
	targetWeight: number | null
	setMode: SetMode
	trainingGoal: TrainingGoal | null
	supersetGroup: number | null
	note: string | null
}

/** Incoming row for merge-by-id: omitted/undefined = leave alone on update; null = clear. */
export interface IncomingWorkoutExerciseRow {
	id?: TypeIDString<'wke'>
	exerciseId: TypeIDString<'exc'>
	targetSets?: number | null
	targetReps?: number | null
	targetWeight?: number | null
	setMode?: SetMode
	trainingGoal?: TrainingGoal | null
	supersetGroup?: number | null
	note?: string | null
}

export interface MergedWorkoutExerciseValues {
	exerciseId: TypeIDString<'exc'>
	sortOrder: number
	targetSets: number | null
	targetReps: number | null
	targetWeight: number | null
	setMode: SetMode
	trainingGoal: TrainingGoal | null
	supersetGroup: number | null
	note: string | null
}

export interface WorkoutExerciseMergePlan {
	updates: Array<{ id: TypeIDString<'wke'>; values: MergedWorkoutExerciseValues }>
	inserts: MergedWorkoutExerciseValues[]
	deleteIds: TypeIDString<'wke'>[]
}

const INSERT_DEFAULTS = {
	targetSets: null,
	targetReps: null,
	targetWeight: null,
	setMode: 'working' as const,
	trainingGoal: null,
	supersetGroup: null,
	note: null
} satisfies Omit<MergedWorkoutExerciseValues, 'exerciseId' | 'sortOrder'>

function mergeUpdateRow(
	existing: ExistingWorkoutExerciseRow,
	incoming: IncomingWorkoutExerciseRow,
	sortOrder: number
): MergedWorkoutExerciseValues {
	return {
		exerciseId: incoming.exerciseId,
		sortOrder,
		targetSets: incoming.targetSets !== undefined ? incoming.targetSets : existing.targetSets,
		targetReps: incoming.targetReps !== undefined ? incoming.targetReps : existing.targetReps,
		targetWeight: incoming.targetWeight !== undefined ? incoming.targetWeight : existing.targetWeight,
		setMode: incoming.setMode !== undefined ? incoming.setMode : existing.setMode,
		trainingGoal: incoming.trainingGoal !== undefined ? incoming.trainingGoal : existing.trainingGoal,
		supersetGroup: incoming.supersetGroup !== undefined ? incoming.supersetGroup : existing.supersetGroup,
		note: incoming.note !== undefined ? incoming.note : existing.note
	}
}

function insertRow(incoming: IncomingWorkoutExerciseRow, sortOrder: number): MergedWorkoutExerciseValues {
	return {
		exerciseId: incoming.exerciseId,
		sortOrder,
		targetSets: incoming.targetSets !== undefined ? incoming.targetSets : INSERT_DEFAULTS.targetSets,
		targetReps: incoming.targetReps !== undefined ? incoming.targetReps : INSERT_DEFAULTS.targetReps,
		targetWeight: incoming.targetWeight !== undefined ? incoming.targetWeight : INSERT_DEFAULTS.targetWeight,
		setMode: incoming.setMode !== undefined ? incoming.setMode : INSERT_DEFAULTS.setMode,
		trainingGoal: incoming.trainingGoal !== undefined ? incoming.trainingGoal : INSERT_DEFAULTS.trainingGoal,
		supersetGroup: incoming.supersetGroup !== undefined ? incoming.supersetGroup : INSERT_DEFAULTS.supersetGroup,
		note: incoming.note !== undefined ? incoming.note : INSERT_DEFAULTS.note
	}
}

/**
 * Plan merge-by-`wke`-id for `updateWorkout.exercises`.
 * Incoming array is the full desired list: present ids update, absent ids insert, orphans delete.
 */
export function planWorkoutExerciseMerge(
	existing: readonly ExistingWorkoutExerciseRow[],
	incoming: readonly IncomingWorkoutExerciseRow[]
): WorkoutExerciseMergePlan {
	const byId = new Map(existing.map(row => [row.id, row]))
	const seen = new Set<TypeIDString<'wke'>>()
	const updates: WorkoutExerciseMergePlan['updates'] = []
	const inserts: MergedWorkoutExerciseValues[] = []

	for (let i = 0; i < incoming.length; i++) {
		const row = incoming[i]
		if (row.id !== undefined) {
			const prev = byId.get(row.id)
			if (!prev) throw new Error(`Workout exercise not found: ${row.id}`)
			if (seen.has(row.id)) throw new Error(`Duplicate workout exercise id: ${row.id}`)
			seen.add(row.id)
			updates.push({ id: row.id, values: mergeUpdateRow(prev, row, i) })
		} else {
			inserts.push(insertRow(row, i))
		}
	}

	const deleteIds = existing.filter(row => !seen.has(row.id)).map(row => row.id)
	return { updates, inserts, deleteIds }
}

/** Patch fields for `updateTemplateExercise` — only defined keys are applied. */
export interface TemplateExercisePatch {
	targetSets?: number | null
	targetReps?: number | null
	targetWeight?: number | null
	setMode?: SetMode
	trainingGoal?: TrainingGoal | null
	supersetGroup?: number | null
	note?: string | null
	sortOrder?: number
}

export function buildTemplateExercisePatch(patch: TemplateExercisePatch): Partial<MergedWorkoutExerciseValues> | null {
	const set: Partial<MergedWorkoutExerciseValues> = {}
	if (patch.targetSets !== undefined) set.targetSets = patch.targetSets
	if (patch.targetReps !== undefined) set.targetReps = patch.targetReps
	if (patch.targetWeight !== undefined) set.targetWeight = patch.targetWeight
	if (patch.setMode !== undefined) set.setMode = patch.setMode
	if (patch.trainingGoal !== undefined) set.trainingGoal = patch.trainingGoal
	if (patch.supersetGroup !== undefined) set.supersetGroup = patch.supersetGroup
	if (patch.note !== undefined) {
		const trimmed = patch.note?.trim() ?? null
		set.note = trimmed && trimmed.length > 0 ? trimmed : null
	}
	if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder
	return Object.keys(set).length > 0 ? set : null
}
