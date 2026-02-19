import type { Exercise, FatigueTier, SetType, TrainingGoal } from '@macromaxxing/db'
import type { RouterOutput } from '~/lib/trpc'
import { roundWeight } from './formulas'

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
 * Warmup sets get 50% of the working set rest (minimum 15s).
 *
 * Evidence basis:
 * - Strength compounds (3-5 min): Grgic et al. 2018, de Salles et al. 2009
 * - Hypertrophy compounds (2-3 min): Schoenfeld et al. 2016, Singer et al. 2024
 * - Isolation exercises (60-120s): Senna et al. 2011, Longo et al. 2023
 * - Warmup at 50% of working rest: Starting Strength, Barbell Medicine, RP
 * - <60s is consistently worse for hypertrophy: Singer et al. 2024 meta-analysis
 */
const TIER_BASE = { 1: 120, 2: 80, 3: 45, 4: 30 } as const
const GOAL_MULTIPLIER = { hypertrophy: 1.0, strength: 2.0 } as const
const PER_REP = 3

export function calculateRest(
	reps: number,
	fatigueTier: FatigueTier,
	goal: TrainingGoal,
	setType: 'warmup' | 'working' | 'backoff' = 'working'
): number {
	const base = Math.round(TIER_BASE[fatigueTier] * GOAL_MULTIPLIER[goal] + reps * PER_REP)
	return Math.max(15, setType === 'warmup' ? Math.round(base * 0.5) : base)
}

export interface GeneratedSet {
	weightKg: number
	reps: number
	setType: 'warmup' | 'backoff'
}

export function generateWarmupSets(workingWeight: number, workingReps: number): GeneratedSet[] {
	if (workingWeight <= 0) return []
	const sets: GeneratedSet[] = []

	// Heavy barbell lifts: bar → 50% → 75%
	if (workingWeight > 60) {
		sets.push({ weightKg: 20, reps: 10, setType: 'warmup' })
		const half = roundWeight(workingWeight * 0.5)
		if (half > 20) sets.push({ weightKg: half, reps: 5, setType: 'warmup' })
		const three4 = roundWeight(workingWeight * 0.75)
		if (three4 > half && workingWeight - three4 >= 5) {
			sets.push({ weightKg: three4, reps: 3, setType: 'warmup' })
		}
	} else {
		// Light/dumbbell: single set at ~60%
		const w = roundWeight(workingWeight * 0.6)
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

export function generateBackoffSets(workingWeight: number, workingReps: number, count = 2): GeneratedSet[] {
	const sets: GeneratedSet[] = []
	for (let i = 0; i < count; i++) {
		const pct = 0.8 - i * 0.1
		sets.push({
			weightKg: roundWeight(workingWeight * pct, 'kg', 'up'),
			reps: workingReps + 2 * (i + 1),
			setType: 'backoff'
		})
	}
	return sets
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
}

export type RenderItem =
	| {
			type: 'standalone'
			exerciseId: Exercise['id']
			exercise: SessionExercise
			logs: SessionLog[]
			planned: PlannedSet[]
	  }
	| {
			type: 'superset'
			group: number
			exercises: Array<{
				exerciseId: Exercise['id']
				exercise: SessionExercise
				logs: SessionLog[]
				planned: PlannedSet[]
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
					completed: i < item.logs.length
				})
			}
		} else {
			const { rounds } = buildSupersetRounds(
				item.exercises.map(e => ({ exercise: e.exercise, logs: e.logs, plannedSets: e.planned }))
			)
			const totalSets = item.exercises.reduce((sum, e) => sum + e.planned.length, 0)
			let setNum = 0
			for (const round of rounds) {
				for (let setIdx = 0; setIdx < round.sets.length; setIdx++) {
					setNum++
					const entry = round.sets[setIdx]
					const isLastInRound = setIdx === round.sets.length - 1
					result.push({
						exerciseId: entry.exerciseId,
						exerciseName: entry.exercise.name,
						setType: entry.planned.setType,
						weightKg: entry.planned.weightKg,
						reps: entry.planned.reps,
						setNumber: setNum,
						totalSets,
						transition: !isLastInRound,
						itemIndex: itemIdx,
						completed: entry.log !== null
					})
				}
			}
		}
	}

	return result
}
