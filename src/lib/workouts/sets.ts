import type { Exercise, FatigueTier, SetMode, SetType, TrainingGoal, WeightSnapper } from '@macromaxxing/db'
import { defaultSnapper, type GeneratedSet, splitTargetSets, type TargetSetSplitInput } from '@macromaxxing/db'
import type { RouterOutput } from '~/lib/trpc'

// Backoff generation + the targetSets split live in `@macromaxxing/db/sets` (the workers backend
// needs the same rules to price template rows). Re-exported so `~/lib/workouts/sets` consumers
// keep working.
export { type GeneratedSet, generateBackoffSets, splitTargetSets } from '@macromaxxing/db'

export const TRAINING_DEFAULTS: Record<TrainingGoal, { targetSets: number; targetReps: number }> = {
	hypertrophy: { targetSets: 3, targetReps: 10 },
	strength: { targetSets: 5, targetReps: 5 }
}

/**
 * Rest period calculation based on fatigue tier, training goal, and reps.
 *
 * Formula: TIER_BASE[tier] × GOAL_MULTIPLIER[goal] + reps × PER_REP
 *
 * The fatigue tier is the dominant factor — heavy compounds (T1) need substantially
 * more rest than isolation exercises (T4). The goal multiplier scales the tier
 * component for strength work (heavier loads → longer recovery). Reps add a small
 * per-rep increment.
 *
 * Warmup sets get 50% of the working set rest.
 *
 * Evidence basis:
 * - Strength compounds (3-5 min): Grgic et al. 2018, de Salles et al. 2009
 * - Hypertrophy compounds (2-3 min): Schoenfeld et al. 2016
 * - Isolation exercises (90-120s): Senna et al. 2011, Grgic et al. 2017
 * - Warmup at 50% of working rest: Starting Strength, Barbell Medicine, RP
 *
 * Longer rest is not itself anabolic — it preserves VOLUME LOAD across sets, which is
 * the thing that drives growth. Short rest costs reps on sets 2+; with rest under ~60s
 * that loss is large enough to show up as less hypertrophy (Schoenfeld 2016: 1 min vs
 * 3 min, 8 weeks, trained men — the 3-min group gained more thickness and strength).
 * Every tier's hypertrophy rest must therefore stay clear of the 60s floor; an earlier
 * table put T4 isolation at exactly 60s and contradicted this comment.
 *
 * The strength multiplier is 1.7 rather than 2.0 so T1 strength lands at ~4.5 min
 * instead of 5:15. The cost is that isolation-on-strength-goal rests longer than
 * anyone really does (T4 @12 reps → 2:18) — accepted as a rare combination rather
 * than splitting the goal knob into a per-tier offset table.
 */
const TIER_BASE = { 1: 150, 2: 110, 3: 75, 4: 60 } as const
const GOAL_MULTIPLIER = { hypertrophy: 1.0, strength: 1.7 } as const
const PER_REP = 3

export function calculateRest(
	reps: number,
	fatigueTier: FatigueTier,
	goal: TrainingGoal,
	setType: 'warmup' | 'working' | 'backoff' = 'working'
): number {
	const base = Math.round(TIER_BASE[fatigueTier] * GOAL_MULTIPLIER[goal] + reps * PER_REP)
	// The 15s floor is unreachable with the current tier bases (the smallest possible
	// warmup is T4 hypertrophy at 0 reps → 30s). Kept as a guard on future retunes.
	return Math.max(15, setType === 'warmup' ? Math.round(base * 0.5) : base)
}

/** Rough time to complete a set (concentric + eccentric), excluding rest. */
const SECONDS_PER_SET = 60
/** Transition between exercises: rack change, walk, set up — on top of inter-set rest. */
const SECONDS_BETWEEN_EXERCISES = 180

interface DurationExercise {
	targetSets: number | null
	targetReps: number | null
	trainingGoal: TrainingGoal | null
	exercise: { fatigueTier: FatigueTier }
}

interface DurationWorkout {
	trainingGoal: TrainingGoal
	exercises: ReadonlyArray<DurationExercise>
}

/**
 * Estimate a workout template's duration in seconds.
 * Per exercise: 1 min per set + `calculateRest` between sets (N−1 rests).
 * Between exercises: +3 min switching. Ignores warmup/backoff extras and
 * supersets (variable in practice).
 */
export function estimateWorkoutDurationSec(workout: DurationWorkout): number {
	if (workout.exercises.length === 0) return 0
	let total = 0
	for (const we of workout.exercises) {
		const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
		const sets = we.targetSets ?? TRAINING_DEFAULTS[goal].targetSets
		const reps = we.targetReps ?? TRAINING_DEFAULTS[goal].targetReps
		const restSec = calculateRest(reps, we.exercise.fatigueTier, goal, 'working')
		// N work intervals, N−1 inter-set rests (no rest after the final set;
		// the move to the next exercise is the between-exercise switch).
		total += sets * SECONDS_PER_SET + Math.max(0, sets - 1) * restSec
	}
	total += Math.max(0, workout.exercises.length - 1) * SECONDS_BETWEEN_EXERCISES
	return total
}

/**
 * Ramp-up sets below the working weight. `snap` turns each percentage into a weight the lifter
 * can actually load (their equipment's step size, or a rung they have logged before) — without it
 * a 10 kg working set warms up at a weight no rack in the building holds.
 */
export function generateWarmupSets(
	workingWeight: number,
	workingReps: number,
	bwMultiplier = 0,
	snap: WeightSnapper = defaultSnapper
): GeneratedSet[] {
	if (bwMultiplier > 0) {
		if (workingReps <= 0) return []
		const sets: GeneratedSet[] = []
		const firstReps = Math.max(3, Math.round(workingReps * 0.6))
		sets.push({ weightKg: 0, reps: firstReps, setType: 'warmup' })
		const secondReps = Math.max(2, Math.round(workingReps * 0.4))
		if (secondReps < firstReps) {
			sets.push({ weightKg: 0, reps: secondReps, setType: 'warmup' })
		}
		return sets
	}

	if (workingWeight <= 0) return []
	const sets: GeneratedSet[] = []

	if (workingWeight > 60) {
		// Heavy lifts: 50% × 60% reps, 75% × 40% reps
		const half = snap(workingWeight * 0.5)
		sets.push({ weightKg: half, reps: Math.max(3, Math.round(workingReps * 0.6)), setType: 'warmup' })
		const three4 = snap(workingWeight * 0.75)
		if (three4 > half && workingWeight - three4 >= 5) {
			sets.push({ weightKg: three4, reps: Math.max(2, Math.round(workingReps * 0.4)), setType: 'warmup' })
		}
	} else {
		// Light/dumbbell: single set at ~60%
		const w = snap(workingWeight * 0.6)
		if (w > 0) sets.push({ weightKg: w, reps: workingReps, setType: 'warmup' })
	}

	return sets
}

interface MuscleEntry {
	muscleGroup: string
	intensity: number
}

/**
 * Returns true if enough of the current exercise's muscles have already
 * been warmed up by preceding exercises (overlap >= 0.5).
 */
export function shouldSkipWarmup(currentMuscles: MuscleEntry[], warmedUpMuscles: Map<string, number>): boolean {
	if (currentMuscles.length === 0) return false
	const totalIntensity = currentMuscles.reduce((sum, m) => sum + m.intensity, 0)
	if (totalIntensity === 0) return false
	let coveredIntensity = 0
	for (const m of currentMuscles) {
		const warmedIntensity = warmedUpMuscles.get(m.muscleGroup) ?? 0
		if (warmedIntensity > 0) {
			coveredIntensity += Math.min(m.intensity, warmedIntensity)
		}
	}
	return coveredIntensity / totalIntensity >= 0.5
}

// --- Planned set generation ---

interface MuscleMapping {
	muscleGroup: string
	intensity: number
}

export interface GeneratePlannedSetsInput {
	setMode: SetMode
	sets: number
	reps: number
	weightKg: number | null
	muscles: MuscleMapping[]
	warmedUpMuscles: Map<string, number>
	bwMultiplier?: number
	/** Loadable-weight grid for this exercise, from the equipment that carries the load. */
	snap?: WeightSnapper
	/**
	 * The working set the folded backoff drops off, when the session has one logged. Defaults to
	 * this row's own target — see `TargetSetSplitInput.backoffFrom`.
	 */
	backoffFrom?: TargetSetSplitInput['backoffFrom']
}

/**
 * Generate the full planned set list (warmup + working + backoff) for an exercise.
 * Also updates warmedUpMuscles in-place to track cross-exercise warmup coverage.
 */
export function generatePlannedSets(input: GeneratePlannedSetsInput): PlannedSet[] {
	const {
		setMode,
		sets: targetSets,
		reps,
		weightKg,
		muscles,
		warmedUpMuscles,
		bwMultiplier = 0,
		snap = defaultSnapper,
		backoffFrom
	} = input
	const result: PlannedSet[] = []
	let setNum = 1

	const hasWarmup = setMode === 'warmup' || setMode === 'full'
	const canGenerateLoad = bwMultiplier > 0 || (weightKg != null && weightKg > 0)

	// Generate warmup sets
	if (hasWarmup && reps > 0 && canGenerateLoad) {
		const skipWarmup = shouldSkipWarmup(muscles, warmedUpMuscles)
		if (!skipWarmup) {
			const warmups = generateWarmupSets(weightKg ?? 0, reps, bwMultiplier, snap)
			for (const wu of warmups) {
				result.push({ setNumber: setNum++, weightKg: wu.weightKg, reps: wu.reps, setType: 'warmup' })
			}
		}
		// Track warmed-up muscles
		for (const m of muscles) {
			const existing = warmedUpMuscles.get(m.muscleGroup) ?? 0
			warmedUpMuscles.set(m.muscleGroup, Math.max(existing, m.intensity))
		}
	}

	// `backoff`/`full` fold one backoff into targetSets — shared with the muscle-load aggregates
	// so a template row can't mean one thing here and another on the program screen.
	const { workingCount, backoff } = splitTargetSets({
		setMode,
		targetSets,
		targetReps: reps,
		targetWeight: weightKg,
		bwMultiplier,
		snap,
		backoffFrom
	})
	for (let i = 0; i < workingCount; i++) {
		result.push({ setNumber: setNum++, weightKg, reps, setType: 'working' })
	}
	if (backoff) {
		result.push({ setNumber: setNum++, weightKg: backoff.weightKg, reps: backoff.reps, setType: 'backoff' })
	}

	return result
}

// --- Shared superset round-building ---

export type SessionLog = RouterOutput['workout']['getSession']['logs'][number]
type SessionExercise = SessionLog['exercise']

export interface PlannedSet {
	setNumber: number
	weightKg: number | null
	reps: number
	setType: SetType
}

export interface RoundSet {
	exerciseId: Exercise['id']
	exercise: SessionExercise
	planned: PlannedSet
	log: SessionLog | null
	exerciseIndex: number
}

export interface Round {
	setType: SetType
	sets: RoundSet[]
}

export interface SupersetExerciseInput {
	exercise: SessionExercise
	logs: SessionLog[]
	plannedSets: PlannedSet[]
}

export function buildSupersetRounds(exercises: SupersetExerciseInput[]): {
	rounds: Round[]
	extraLogs: Array<{ log: SessionLog; exercise: SessionExercise }>
} {
	const exercisePhases = exercises.map((exData, exIdx) => {
		const { exercise, logs, plannedSets } = exData

		const warmupLogs = logs.filter(l => l.setType === 'warmup')
		const workingLogs = logs.filter(l => l.setType === 'working')
		const backoffLogs = logs.filter(l => l.setType === 'backoff')

		const plannedWarmups = plannedSets.filter(s => s.setType === 'warmup')
		const plannedWorking = plannedSets.filter(s => s.setType === 'working')
		const plannedBackoffs = plannedSets.filter(s => s.setType === 'backoff')

		const warmups: RoundSet[] = plannedWarmups.map((p, i) => ({
			exerciseId: exercise.id,
			exercise,
			planned: p,
			log: warmupLogs[i] ?? null,
			exerciseIndex: exIdx
		}))
		const working: RoundSet[] = plannedWorking.map((p, i) => ({
			exerciseId: exercise.id,
			exercise,
			planned: p,
			log: workingLogs[i] ?? null,
			exerciseIndex: exIdx
		}))
		const backoffs: RoundSet[] = plannedBackoffs.map((p, i) => ({
			exerciseId: exercise.id,
			exercise,
			planned: p,
			log: backoffLogs[i] ?? null,
			exerciseIndex: exIdx
		}))

		const extras: SessionLog[] = [
			...warmupLogs.slice(plannedWarmups.length),
			...workingLogs.slice(plannedWorking.length),
			...backoffLogs.slice(plannedBackoffs.length)
		]

		return { warmups, working, backoffs, extras, exercise }
	})

	const rounds: Round[] = []

	const maxWarmups = Math.max(0, ...exercisePhases.map(e => e.warmups.length))
	for (let i = 0; i < maxWarmups; i++) {
		const sets = exercisePhases.filter(e => i < e.warmups.length).map(e => e.warmups[i])
		rounds.push({ setType: 'warmup', sets })
	}

	const maxWorking = Math.max(0, ...exercisePhases.map(e => e.working.length))
	for (let i = 0; i < maxWorking; i++) {
		const sets = exercisePhases.filter(e => i < e.working.length).map(e => e.working[i])
		rounds.push({ setType: 'working', sets })
	}

	const maxBackoffs = Math.max(0, ...exercisePhases.map(e => e.backoffs.length))
	for (let i = 0; i < maxBackoffs; i++) {
		const sets = exercisePhases.filter(e => i < e.backoffs.length).map(e => e.backoffs[i])
		rounds.push({ setType: 'backoff', sets })
	}

	const extraLogs = exercisePhases.flatMap(ep => ep.extras.map(log => ({ log, exercise: ep.exercise })))

	return { rounds, extraLogs }
}

// --- Flat set list for TimerMode ---

export interface SupersetInfo {
	group: number
	exerciseLetter: string
	exercises: Array<{ exerciseId: Exercise['id']; name: string; letter: string }>
}

export interface FlatSet {
	exerciseId: Exercise['id']
	exerciseName: string
	setType: SetType
	weightKg: number | null
	reps: number
	setNumber: number
	totalSets: number
	transition: boolean
	itemIndex: number
	completed: boolean
	bwMultiplier: number
	fatigueTier: FatigueTier
	/** Effective training goal for this exercise (per-exercise override or workout goal) — drives rest duration. */
	goal: TrainingGoal
	/** The log filling this planned slot, if any. Optimistic entries carry a placeholder id until the server responds. */
	log: SessionLog | null
	superset: SupersetInfo | null
	/** Per-template exercise note, shown below the exercise name in timer mode. */
	note?: string | null
}

export type RenderItem =
	| {
			type: 'standalone'
			exerciseId: Exercise['id']
			exercise: SessionExercise
			logs: SessionLog[]
			planned: PlannedSet[]
			goal: TrainingGoal
			note?: string | null
	  }
	| {
			type: 'superset'
			group: number
			exercises: Array<{
				exerciseId: Exercise['id']
				exercise: SessionExercise
				logs: SessionLog[]
				planned: PlannedSet[]
				goal: TrainingGoal
				note?: string | null
			}>
	  }

export function flattenSets(exerciseGroups: RenderItem[]): FlatSet[] {
	const result: FlatSet[] = []

	for (let itemIdx = 0; itemIdx < exerciseGroups.length; itemIdx++) {
		const item = exerciseGroups[itemIdx]

		if (item.type === 'standalone') {
			for (let i = 0; i < item.planned.length; i++) {
				const planned = item.planned[i]
				result.push({
					exerciseId: item.exerciseId,
					exerciseName: item.exercise.name,
					setType: planned.setType,
					weightKg: planned.weightKg,
					reps: planned.reps,
					setNumber: i + 1,
					totalSets: item.planned.length,
					transition: false,
					itemIndex: itemIdx,
					completed: i < item.logs.length,
					bwMultiplier: item.exercise.bwMultiplier,
					fatigueTier: item.exercise.fatigueTier,
					goal: item.goal,
					log: item.logs[i] ?? null,
					superset: null,
					note: item.note ?? null
				})
			}
		} else {
			const { rounds } = buildSupersetRounds(
				item.exercises.map(e => ({ exercise: e.exercise, logs: e.logs, plannedSets: e.planned }))
			)
			const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
			const supersetExercises = item.exercises.map((e, i) => ({
				exerciseId: e.exerciseId,
				name: e.exercise.name,
				letter: LETTERS[i]
			}))
			// Per-exercise set numbering so unequal supersets read naturally
			// (e.g. "Set 3 of 3 for A" instead of "Set 5 of 5" across the whole block).
			const totalsByExercise = new Map(item.exercises.map(e => [e.exerciseId, e.planned.length]))
			const seenByExercise = new Map<string, number>()
			for (const round of rounds) {
				for (let setIdx = 0; setIdx < round.sets.length; setIdx++) {
					const entry = round.sets[setIdx]
					const isLastInRound = setIdx === round.sets.length - 1
					const exerciseIndex = item.exercises.findIndex(e => e.exerciseId === entry.exerciseId)
					const nextNum = (seenByExercise.get(entry.exerciseId) ?? 0) + 1
					seenByExercise.set(entry.exerciseId, nextNum)
					result.push({
						exerciseId: entry.exerciseId,
						exerciseName: entry.exercise.name,
						setType: entry.planned.setType,
						weightKg: entry.planned.weightKg,
						reps: entry.planned.reps,
						setNumber: nextNum,
						totalSets: totalsByExercise.get(entry.exerciseId) ?? 0,
						transition: !isLastInRound,
						itemIndex: itemIdx,
						completed: entry.log !== null,
						bwMultiplier: entry.exercise.bwMultiplier,
						fatigueTier: entry.exercise.fatigueTier,
						goal: item.exercises[exerciseIndex]?.goal ?? 'hypertrophy',
						log: entry.log,
						superset: {
							group: item.group,
							exerciseLetter: LETTERS[exerciseIndex],
							exercises: supersetExercises
						},
						note: item.exercises[exerciseIndex]?.note ?? null
					})
				}
			}
		}
	}

	return result
}
