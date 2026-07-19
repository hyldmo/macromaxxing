import { FATIGUE_TIER_WEIGHTS, type FatigueTier, type MuscleGroup, type TrainingGoal } from '@macromaxxing/db'

/** Minimum exercise→muscle intensity to count as "hitting" that muscle.
 * Below 0.3 = incidental (per classifyIntensity bucket in @macromaxxing/db). */
export const REST_INTENSITY_THRESHOLD = 0.3

const RECOVERY_BASE_HOURS = 24
const RECOVERY_MAX_HOURS = 96
/** Heuristic: 1 fatigue unit ≈ 6h of additional recovery. Calibrated so 4 sets heavy
 * bench (tier 1, intensity 1) → 48h and 8 sets → 72h. */
const RECOVERY_HOURS_PER_FATIGUE_UNIT = 6

/** Minimal workout shape needed for rest computation — structurally compatible with
 * `RouterOutput['workout']['listWorkouts'][number]` but narrowed to fields actually used. */
export interface RestWorkoutInput {
	trainingGoal: TrainingGoal
	exercises: ReadonlyArray<{
		targetSets: number | null
		trainingGoal: TrainingGoal | null
		exercise: {
			fatigueTier: FatigueTier
			muscles: ReadonlyArray<{ muscleGroup: MuscleGroup; intensity: number }>
		}
	}>
}

export interface WorkoutMuscleHit {
	muscleGroup: MuscleGroup
	/** Max intensity across exercises in this workout that hit this muscle. */
	intensity: number
	/** Σ(targetSets × intensity) across exercises hitting this muscle — drives chip size. */
	effectiveSets: number
	/** Σ(targetSets × intensity × tierWeight) — drives recovery hours for the next workout. */
	fatigueUnits: number
}

function resolveSets(targetSets: number | null, exerciseGoal: TrainingGoal | null, workoutGoal: TrainingGoal): number {
	const goal: TrainingGoal = exerciseGoal ?? workoutGoal
	return targetSets ?? (goal === 'strength' ? 5 : 3)
}

/** Aggregate the per-muscle stimulus of one workout template. */
export function collectWorkoutMuscles(workout: RestWorkoutInput): WorkoutMuscleHit[] {
	const byMuscle = new Map<MuscleGroup, WorkoutMuscleHit>()
	for (const we of workout.exercises) {
		const sets = resolveSets(we.targetSets, we.trainingGoal, workout.trainingGoal)
		const tierWeight = FATIGUE_TIER_WEIGHTS[we.exercise.fatigueTier]
		for (const m of we.exercise.muscles) {
			if (m.intensity < REST_INTENSITY_THRESHOLD) continue
			const effective = sets * m.intensity
			const fatigueUnits = effective * tierWeight
			const prev = byMuscle.get(m.muscleGroup)
			if (prev) {
				prev.intensity = Math.max(prev.intensity, m.intensity)
				prev.effectiveSets += effective
				prev.fatigueUnits += fatigueUnits
			} else {
				byMuscle.set(m.muscleGroup, {
					muscleGroup: m.muscleGroup,
					intensity: m.intensity,
					effectiveSets: effective,
					fatigueUnits
				})
			}
		}
	}
	return Array.from(byMuscle.values()).sort((a, b) => b.effectiveSets - a.effectiveSets)
}

/** Map fatigue units to required recovery hours, clamped to [24, 96]. */
export function recoveryHoursFromFatigue(fatigueUnits: number): number {
	const raw = RECOVERY_BASE_HOURS + RECOVERY_HOURS_PER_FATIGUE_UNIT * Math.max(0, fatigueUnits)
	return Math.min(RECOVERY_MAX_HOURS, Math.max(RECOVERY_BASE_HOURS, Math.round(raw)))
}

export interface RestMuscle {
	muscleGroup: MuscleGroup
	/** Hours of rest needed before the next workout, based on the prior workout's stimulus. */
	recoveryHours: number
	/** Σ stimulus on this muscle in the prior workout. */
	fatigueUnits: number
}

export interface RestTransition {
	fromIdx: number
	toIdx: number
	/** Constraint muscles hit in BOTH W_prev and W_next, sorted by recoveryHours desc. */
	muscles: RestMuscle[]
	/** Max recovery hours across constraint muscles. 0 when no overlap. */
	bottleneckHours: number
	/** Muscle driving the bottleneck. null when no overlap. */
	bottleneckMuscle: MuscleGroup | null
}

/**
 * For each transition between consecutive workouts (with wrap), compute per-muscle
 * recovery hours needed before the next workout. Only muscles hit in BOTH the prior
 * and next workout constrain the rest — muscles unique to W_next don't contribute.
 * Uses the prior workout's stimulus only (no cumulative fatigue across the cycle).
 */
export function computeProgramRest(workouts: readonly RestWorkoutInput[]): RestTransition[] {
	const cycleLength = workouts.length
	if (cycleLength < 2) return []

	const perWorkout = workouts.map(w => {
		const map = new Map<MuscleGroup, WorkoutMuscleHit>()
		for (const m of collectWorkoutMuscles(w)) map.set(m.muscleGroup, m)
		return map
	})

	return workouts.map((_, fromIdx) => {
		const toIdx = (fromIdx + 1) % cycleLength
		const prevHits = perWorkout[fromIdx]
		const nextHits = perWorkout[toIdx]
		const muscles: RestMuscle[] = []
		for (const [mg, prev] of prevHits) {
			if (!nextHits.has(mg)) continue
			muscles.push({
				muscleGroup: mg,
				recoveryHours: recoveryHoursFromFatigue(prev.fatigueUnits),
				fatigueUnits: prev.fatigueUnits
			})
		}
		muscles.sort((a, b) => b.recoveryHours - a.recoveryHours)
		const top = muscles[0]
		return {
			fromIdx,
			toIdx,
			muscles,
			bottleneckHours: top?.recoveryHours ?? 0,
			bottleneckMuscle: top?.muscleGroup ?? null
		}
	})
}

export type RecoveryBucket = 'fresh' | 'moderate' | 'heavy'

/** Bucket recovery hours into a color band. ≤24h fresh, 25–48h moderate, >48h heavy. */
export function classifyRecovery(hours: number): RecoveryBucket {
	if (hours <= 24) return 'fresh'
	if (hours <= 48) return 'moderate'
	return 'heavy'
}

/** Sum of bottleneck recovery hours across all cycle transitions — the optimizer objective. */
function scoreOrdering(workouts: readonly RestWorkoutInput[]): number {
	let total = 0
	for (const t of computeProgramRest(workouts)) total += t.bottleneckHours
	return total
}

/**
 * Estimated full-cycle length in days. Each transition contributes at least 24h
 * (no-overlap floor — you still want a day between workouts in practice), then
 * we ceiling-divide the total by 24. So 40h total → 2 days, 60h → 3 days.
 */
export function programCycleDays(workouts: readonly RestWorkoutInput[]): number {
	if (workouts.length === 0) return 0
	const transitions = computeProgramRest(workouts)
	if (transitions.length === 0) return 1
	let totalHours = 0
	for (const t of transitions) totalHours += Math.max(t.bottleneckHours, 24)
	return Math.ceil(totalHours / 24)
}

function permute<T>(arr: readonly T[]): T[][] {
	if (arr.length <= 1) return [arr.slice()]
	const out: T[][] = []
	for (let i = 0; i < arr.length; i++) {
		const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
		for (const sub of permute(rest)) out.push([arr[i], ...sub])
	}
	return out
}

/**
 * Find the workout ordering that minimizes cumulative recovery debt across the cycle.
 * Returns indices into the input array. The first slot is held fixed (the cycle is
 * rotation-invariant — pinning W₀ preserves the user's "day 1" choice). Brute-force
 * over (N-1)! permutations; fine for N ≤ ~8 (typical programs are 3-6 workouts).
 * Ties keep the original ordering since we replace only on strictly-lower score.
 */
export function findOptimalOrder(workouts: readonly RestWorkoutInput[]): number[] {
	const n = workouts.length
	if (n < 3) return workouts.map((_, i) => i)
	const tail = Array.from({ length: n - 1 }, (_, i) => i + 1)
	let bestOrder = [0, ...tail]
	let bestScore = scoreOrdering(bestOrder.map(i => workouts[i]))
	for (const perm of permute(tail)) {
		const candidate = [0, ...perm]
		const score = scoreOrdering(candidate.map(i => workouts[i]))
		if (score < bestScore) {
			bestOrder = candidate
			bestScore = score
		}
	}
	return bestOrder
}
