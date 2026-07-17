import type { Exercise, SetMode, TrainingGoal } from '@macromaxxing/db'
import { generatePlannedSets, type PlannedSet, type RenderItem, type SessionLog, TRAINING_DEFAULTS } from './sets'

type SessionExercise = SessionLog['exercise']

/** One row of a session's materialized plan (`sessionPlannedExercises`), with the exercise loaded. */
export interface PlannedExerciseRow {
	exerciseId: Exercise['id']
	sortOrder: number
	targetSets: number | null
	targetReps: number | null
	targetWeight: number | null
	setMode: SetMode
	trainingGoal: TrainingGoal | null
	supersetGroup: number | null
	exercise: SessionExercise
}

export interface SessionPlanInput {
	/** The session's own plan rows — the source of truth. Template edits do not flow in here. */
	plannedExercises: PlannedExerciseRow[]
	logs: SessionLog[]
	workoutGoal: TrainingGoal
	/** Per-exercise guidance notes, read live from the template (not part of the plan snapshot). */
	notes?: ReadonlyMap<Exercise['id'], string | null>
}

export interface SessionPlan {
	exerciseGroups: RenderItem[]
	/** Exercises with logs but no plan row (added ad hoc during the session). */
	extraExercises: Array<{ exercise: SessionExercise; logs: SessionLog[] }>
	modes: Map<Exercise['id'], SetMode>
	goals: Map<Exercise['id'], TrainingGoal>
}

/**
 * Build the render plan for a session: planned sets per exercise (warmup/backoff
 * auto-generation with cross-exercise warmup dedup), superset grouping, and extra
 * exercises logged outside the plan. Pure — derived fresh from live session data
 * on every call.
 */
export function buildSessionPlan({ plannedExercises, logs, workoutGoal, notes }: SessionPlanInput): SessionPlan {
	type ExerciseGroup = { exercise: SessionExercise; logs: SessionLog[] }

	const logsByExercise = new Map<Exercise['id'], ExerciseGroup>()
	for (const log of logs) {
		const existing = logsByExercise.get(log.exerciseId)
		if (existing) {
			existing.logs.push(log)
		} else {
			logsByExercise.set(log.exerciseId, { exercise: log.exercise, logs: [log] })
		}
	}

	const modes = new Map<Exercise['id'], SetMode>()
	const goals = new Map<Exercise['id'], TrainingGoal>()
	const plannedIds = new Set<Exercise['id']>()

	// Track which muscles preceding exercises have warmed up (skips redundant warmup sets)
	const warmedUpMuscles = new Map<string, number>()

	type ExerciseData = {
		exerciseId: Exercise['id']
		exercise: SessionExercise
		logs: SessionLog[]
		planned: PlannedSet[]
		goal: TrainingGoal
		supersetGroup: number | null
		note: string | null
	}
	const exerciseDataList: ExerciseData[] = []

	for (const pe of [...plannedExercises].sort((a, b) => a.sortOrder - b.sortOrder)) {
		plannedIds.add(pe.exerciseId)
		modes.set(pe.exerciseId, pe.setMode)

		const goal = pe.trainingGoal ?? workoutGoal
		goals.set(pe.exerciseId, goal)
		const defaults = TRAINING_DEFAULTS[goal]

		const planned = generatePlannedSets({
			setMode: pe.setMode,
			sets: pe.targetSets ?? defaults.targetSets,
			reps: pe.targetReps ?? defaults.targetReps,
			weightKg: pe.targetWeight,
			muscles: pe.exercise.muscles,
			warmedUpMuscles,
			bwMultiplier: pe.exercise.bwMultiplier
		})

		const logged = logsByExercise.get(pe.exerciseId)
		exerciseDataList.push({
			exerciseId: pe.exerciseId,
			exercise: logged?.exercise ?? pe.exercise,
			logs: logged?.logs ?? [],
			planned,
			goal,
			supersetGroup: pe.supersetGroup,
			note: notes?.get(pe.exerciseId) ?? null
		})
	}

	// Exercises logged outside the plan
	const extraExercises: SessionPlan['extraExercises'] = []
	for (const [exerciseId, data] of logsByExercise) {
		if (plannedIds.has(exerciseId)) continue
		goals.set(exerciseId, workoutGoal)
		exerciseDataList.push({
			exerciseId,
			exercise: data.exercise,
			logs: data.logs,
			planned: [],
			goal: workoutGoal,
			supersetGroup: null,
			note: null
		})
		extraExercises.push(data)
	}

	// Group into RenderItems (supersets need >= 2 members, otherwise standalone)
	const exerciseGroups: RenderItem[] = []
	const processedIds = new Set<Exercise['id']>()

	for (const ed of exerciseDataList) {
		if (processedIds.has(ed.exerciseId)) continue

		if (ed.supersetGroup !== null) {
			const members = exerciseDataList.filter(
				e => e.supersetGroup === ed.supersetGroup && !processedIds.has(e.exerciseId)
			)
			if (members.length >= 2) {
				exerciseGroups.push({
					type: 'superset',
					group: ed.supersetGroup,
					exercises: members.map(e => ({
						exerciseId: e.exerciseId,
						exercise: e.exercise,
						logs: e.logs,
						planned: e.planned,
						goal: e.goal,
						note: e.note
					}))
				})
				for (const m of members) processedIds.add(m.exerciseId)
				continue
			}
		}

		processedIds.add(ed.exerciseId)
		exerciseGroups.push({
			type: 'standalone',
			exerciseId: ed.exerciseId,
			exercise: ed.exercise,
			logs: ed.logs,
			planned: ed.planned,
			goal: ed.goal,
			note: ed.note
		})
	}

	return { exerciseGroups, extraExercises, modes, goals }
}
