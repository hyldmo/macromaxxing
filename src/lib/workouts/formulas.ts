import type { Exercise, SetMode, Sex, TrainingGoal, TypeIDString } from '@macromaxxing/db'
import { midpoint } from '../math'

// ─── Rep Range Resolution ───────────────────────────────────────────

type RepRangeExercise = Pick<
	Exercise,
	'type' | 'strengthRepsMin' | 'strengthRepsMax' | 'hypertrophyRepsMin' | 'hypertrophyRepsMax'
>

/**
 * Resolve the rep range for an exercise + training goal.
 *
 * Resolution order:
 * 1. Explicit DB value for the goal → use directly
 * 2. Derive hypertrophy from strength → { min: strengthMax, max: strengthMax * 2 }
 * 3. Type-based fallback → compound strength 3–5, compound hypertrophy 8–12, isolation 10–15
 */
export function getRepRange(exercise: RepRangeExercise, goal: TrainingGoal): { min: number; max: number } {
	if (goal === 'strength') {
		if (exercise.strengthRepsMin != null && exercise.strengthRepsMax != null) {
			return { min: exercise.strengthRepsMin, max: exercise.strengthRepsMax }
		}
		return exercise.type === 'compound' ? { min: 3, max: 5 } : { min: 10, max: 15 }
	}

	// Hypertrophy
	if (exercise.hypertrophyRepsMin != null && exercise.hypertrophyRepsMax != null) {
		return { min: exercise.hypertrophyRepsMin, max: exercise.hypertrophyRepsMax }
	}
	// Derive from strength range
	if (exercise.strengthRepsMax != null) {
		return { min: exercise.strengthRepsMax, max: exercise.strengthRepsMax * 2 }
	}
	return exercise.type === 'compound' ? { min: 8, max: 12 } : { min: 10, max: 15 }
}

/** Brzycki 1RM estimate: weight * 36 / (37 - reps) */
export function estimated1RM(weightKg: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return weightKg
	return weightKg * (36 / (37 - reps))
}

/** Inverse Brzycki: working weight for a given 1RM and target reps */
export function weightForReps(oneRM: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return oneRM
	return oneRM * ((37 - reps) / 36)
}

export type WeightUnit = 'kg' | 'lbs'

/** Pick the smallest practical plate increment for a given weight. */
function plateIncrement(weight: number, unit: WeightUnit): number {
	if (unit === 'lbs') {
		if (weight <= 10) return 1
		if (weight <= 40) return 2.5
		return 5
	}
	// kg
	if (weight <= 5) return 0.5
	if (weight <= 20) return 1.25
	return 2.5
}

/** Round weight to the nearest practical plate increment. */
export function roundWeight(
	weight: number,
	unit: WeightUnit = 'kg',
	direction: 'nearest' | 'up' | 'down' = 'nearest'
): number {
	const inc = plateIncrement(Math.abs(weight), unit)
	// Snap ratio to avoid floating-point errors (e.g. 20*0.7=14.0000000002 → 14/2=7.0000000001 → ceil=8)
	const ratio = Math.round((weight / inc) * 1e10) / 1e10
	const fn = direction === 'up' ? Math.ceil : direction === 'down' ? Math.floor : Math.round
	return fn(ratio) * inc
}

/**
 * Estimate a replacement exercise's working weight using strength standards.
 * Looks at all template exercises with known weights and finds a path
 * through the standards table to the replacement exercise.
 */
export function estimateReplacementWeight(
	replacementId: string,
	targetReps: number,
	templateExercises: Array<{ exerciseId: string; targetWeight: number | null; targetReps: number | null }>,
	standards: Array<{ compoundId: string; isolationId: string; maxRatio: number }>
): number | null {
	for (const te of templateExercises) {
		if (te.targetWeight == null || te.targetWeight <= 0) continue
		const known1RM = estimated1RM(te.targetWeight, te.targetReps ?? targetReps)

		// Direct: known is compound, replacement is isolation
		const directCI = standards.find(s => s.compoundId === te.exerciseId && s.isolationId === replacementId)
		if (directCI) {
			return roundWeight(weightForReps(known1RM * directCI.maxRatio, targetReps))
		}

		// Direct: known is isolation, replacement is compound
		const directIC = standards.find(s => s.isolationId === te.exerciseId && s.compoundId === replacementId)
		if (directIC) {
			return roundWeight(weightForReps(known1RM / directIC.maxRatio, targetReps))
		}

		// Transitive: both isolations of the same compound
		const knownAsIso = standards.find(s => s.isolationId === te.exerciseId)
		const replAsIso = standards.find(s => s.isolationId === replacementId)
		if (knownAsIso && replAsIso && knownAsIso.compoundId === replAsIso.compoundId) {
			const compound1RM = known1RM / knownAsIso.maxRatio
			return roundWeight(weightForReps(compound1RM * replAsIso.maxRatio, targetReps))
		}
	}
	return null
}

export interface E1rmStat {
	name: string
	weightKg: number
	reps: number
	e1rm: number
	volume: number
}

/** Per-exercise estimated 1RM stats from a list of logs, sorted by highest e1RM */
export function exerciseE1rmStats(
	logs: ReadonlyArray<{ exerciseId: string; weightKg: number; reps: number; exercise: { name: string } }>
): E1rmStat[] {
	const byExercise = new Map<string, { name: string; logs: Array<{ weightKg: number; reps: number }> }>()

	for (const log of logs) {
		const existing = byExercise.get(log.exerciseId)
		if (existing) {
			existing.logs.push(log)
		} else {
			byExercise.set(log.exerciseId, { name: log.exercise.name, logs: [log] })
		}
	}

	const stats: E1rmStat[] = []

	for (const [, { name, logs: exLogs }] of byExercise) {
		let bestE1rm = 0
		let bestWeight = 0
		let bestReps = 0

		for (const log of exLogs) {
			if (log.weightKg <= 0 || log.reps <= 0) continue
			const e1rm = estimated1RM(log.weightKg, log.reps)
			if (e1rm > bestE1rm) {
				bestE1rm = e1rm
				bestWeight = log.weightKg
				bestReps = log.reps
			}
		}

		if (bestE1rm > 0) {
			stats.push({ name, weightKg: bestWeight, reps: bestReps, e1rm: bestE1rm, volume: totalVolume(exLogs) })
		}
	}

	return stats.sort((a, b) => b.e1rm - a.e1rm)
}

/** Height-based limb length factor for leverage adjustment */
export function limbLengthFactor(heightCm: number): number {
	if (heightCm <= 185) return 1.0
	return 1 + (heightCm - 185) * 0.004
}

/** Total volume = Σ(weight * reps) */
export function totalVolume(logs: Array<{ weightKg: number; reps: number; sets?: number }>): number {
	return logs.reduce((sum, { weightKg, reps, sets = 1 }) => sum + weightKg * reps * sets, 0)
}

/** Work done in Joules: weight * 9.81 * ROM_meters * reps */
export function workDoneJoules(weightKg: number, reps: number, romMeters: number): number {
	return weightKg * 9.81 * romMeters * reps
}

/** Mifflin-St Jeor BMR estimate */
export function estimateBMR(weightKg: number, heightCm: number, age: number, sex: Sex): number {
	const base = 10 * weightKg + 6.25 * heightCm - 5 * age
	return sex === 'male' ? base + 5 : base - 161
}

/** TDEE = BMR * activity multiplier */
export function estimateTDEE(bmr: number, activityMultiplier: number): number {
	return bmr * activityMultiplier
}

/** Protein intake per kg bodyweight */
export function proteinPerKg(proteinGrams: number, weightKg: number): number {
	if (weightKg <= 0) return 0
	return proteinGrams / weightKg
}

export function defaultSets(goal: TrainingGoal): number {
	return goal === 'strength' ? 5 : 3
}

// ─── Target Resolution ──────────────────────────────────────────────

interface TargetExercise {
	exercise: RepRangeExercise
	targetSets: number | null
	targetReps: number | null
	targetWeight: number | null
}

/** Resolve effective sets/reps/weight for a workout exercise, filling in defaults from training goal. */
export function resolveExerciseTargets(
	we: TargetExercise,
	goal: TrainingGoal
): { sets: number; reps: number; weightKg: number } {
	const range = getRepRange(we.exercise, goal)
	return {
		sets: we.targetSets ?? defaultSets(goal),
		reps: we.targetReps ?? Math.round(midpoint(range)),
		weightKg: we.targetWeight ?? 0
	}
}

// ─── Divergence Calculation ──────────────────────────────────────────

export interface Divergence {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	planned: { sets: number; reps: number; weight: number | null }
	actual: { sets: number; reps: number; weight: number }
	improved: boolean
	suggestion: { targetSets: number; targetReps: number; targetWeight: number | null }
}

interface PlannedExerciseInput {
	exerciseId: TypeIDString<'exc'>
	exercise: RepRangeExercise & { name: string }
	targetSets: number | null
	targetReps: number | null
	targetWeight: number | null
	setMode: SetMode | null
	trainingGoal: TrainingGoal | null
}

interface LogInput {
	exerciseId: string
	setType: string
	weightKg: number
	reps: number
}

/** Compute per-exercise divergences between planned and actual performance */
export function computeDivergences(
	logs: ReadonlyArray<LogInput>,
	plannedExercises: ReadonlyArray<PlannedExerciseInput>,
	workoutGoal: TrainingGoal
): Divergence[] {
	const result: Divergence[] = []

	for (const we of plannedExercises) {
		const exerciseLogs = logs.filter(l => l.exerciseId === we.exerciseId && l.setType === 'working')
		if (exerciseLogs.length === 0) continue

		const exerciseGoal = we.trainingGoal ?? workoutGoal
		const range = getRepRange(we.exercise, exerciseGoal)

		const templateMode = we.setMode ?? 'working'
		const hasBackoff = templateMode === 'backoff' || templateMode === 'full'
		const totalSets = we.targetSets ?? defaultSets(exerciseGoal)
		const effectiveSets = hasBackoff ? Math.max(1, totalSets - 1) : totalSets
		const effectiveReps = we.targetReps ?? range.max

		const bestSet = exerciseLogs.reduce((best, l) =>
			l.weightKg > best.weightKg || (l.weightKg === best.weightKg && l.reps > best.reps) ? l : best
		)

		const weightDiff = we.targetWeight != null ? Math.abs(bestSet.weightKg - we.targetWeight) : 0
		const repsDiff = Math.abs(bestSet.reps - effectiveReps)
		const setsDiff = Math.abs(exerciseLogs.length - effectiveSets)

		if (weightDiff > 0.1 || repsDiff > 0 || setsDiff > 0) {
			const improved =
				bestSet.weightKg >= (we.targetWeight ?? 0) &&
				bestSet.reps >= effectiveReps &&
				exerciseLogs.length >= effectiveSets

			// Double progression: if reps hit the ceiling, suggest bumping weight and resetting reps
			// Always base on logged weight — it reflects real available equipment better than template targets
			const hitCeiling = bestSet.reps >= range.max && bestSet.weightKg > 0
			const suggestion: Divergence['suggestion'] = hitCeiling
				? {
						targetSets: exerciseLogs.length,
						targetReps: range.max,
						targetWeight: roundWeight(bestSet.weightKg + plateIncrement(bestSet.weightKg, 'kg'), 'kg', 'up')
					}
				: {
						targetSets: exerciseLogs.length,
						targetReps: bestSet.reps,
						targetWeight: bestSet.weightKg > 0 ? bestSet.weightKg : null
					}

			result.push({
				exerciseId: we.exerciseId,
				exerciseName: we.exercise.name,
				planned: { sets: effectiveSets, reps: effectiveReps, weight: we.targetWeight },
				actual: { sets: exerciseLogs.length, reps: bestSet.reps, weight: bestSet.weightKg },
				improved,
				suggestion
			})
		}
	}

	return result
}
