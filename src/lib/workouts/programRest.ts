import { FATIGUE_TIER_WEIGHTS, type FatigueTier, type MuscleGroup, type TrainingGoal } from '@macromaxxing/db'

/** Minimum exercise→muscle intensity to count as "hitting" that muscle.
 * Below 0.3 = incidental (per classifyIntensity bucket in @macromaxxing/db). */
export const REST_INTENSITY_THRESHOLD = 0.3

const RECOVERY_MIN_HOURS = 12
const RECOVERY_MAX_HOURS = 96
/**
 * Two points the curve passes through exactly: 4 sets heavy bench (tier 1, intensity 1) → 48h,
 * 8 sets → 72h. Doubling the stimulus costs less than double the recovery, so the map is a power
 * law through those anchors, not a line. A line through both has to cross zero fatigue at 24h,
 * which floored every light overlap at a full day — a few sets of a tier-4 isolation read the
 * same 24h as a heavy compound, so the number carried no information at the low end.
 */
const RECOVERY_ANCHOR_LOW = { fatigueUnits: 4, hours: 48 }
const RECOVERY_ANCHOR_HIGH = { fatigueUnits: 8, hours: 72 }
const RECOVERY_EXPONENT =
	Math.log((RECOVERY_ANCHOR_HIGH.hours - RECOVERY_MIN_HOURS) / (RECOVERY_ANCHOR_LOW.hours - RECOVERY_MIN_HOURS)) /
	Math.log(RECOVERY_ANCHOR_HIGH.fatigueUnits / RECOVERY_ANCHOR_LOW.fatigueUnits)
const RECOVERY_COEFFICIENT =
	(RECOVERY_ANCHOR_LOW.hours - RECOVERY_MIN_HOURS) / RECOVERY_ANCHOR_LOW.fatigueUnits ** RECOVERY_EXPONENT

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

/** Map fatigue units to required recovery hours, clamped to [12, 96]. */
export function recoveryHoursFromFatigue(fatigueUnits: number): number {
	const raw = RECOVERY_MIN_HOURS + RECOVERY_COEFFICIENT * Math.max(0, fatigueUnits) ** RECOVERY_EXPONENT
	return Math.min(RECOVERY_MAX_HOURS, Math.max(RECOVERY_MIN_HOURS, Math.round(raw)))
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

/**
 * Effective sets already carried per muscle by the workout at `index` AND its two cycle
 * neighbours. Those are the three sessions an added exercise can collide with: work stacked
 * inside the session itself, and work that extends the recovery debt `computeProgramRest`
 * charges on the way in and on the way out. Neighbours dedupe, so a 1- or 2-workout cycle
 * counts each workout once.
 */
export function cycleOverlapLoad(workouts: readonly RestWorkoutInput[], index: number): Map<MuscleGroup, number> {
	const load = new Map<MuscleGroup, number>()
	const cycleLength = workouts.length
	if (cycleLength === 0 || index < 0 || index >= cycleLength) return load
	const neighbourhood = new Set([index, (index - 1 + cycleLength) % cycleLength, (index + 1) % cycleLength])
	for (const i of neighbourhood) {
		for (const hit of collectWorkoutMuscles(workouts[i])) {
			load.set(hit.muscleGroup, (load.get(hit.muscleGroup) ?? 0) + hit.effectiveSets)
		}
	}
	return load
}

/**
 * How much of an exercise lands on tissue that is already loaded — Σ(intensity × existing sets)
 * over the muscles it hits. 0 = nothing around it trains those muscles. Sort ascending to
 * suggest the exercises that add the least overlap.
 */
export function exerciseOverlapScore(
	muscles: ReadonlyArray<{ muscleGroup: MuscleGroup; intensity: number }>,
	load: ReadonlyMap<MuscleGroup, number>
): number {
	let score = 0
	for (const m of muscles) {
		if (m.intensity < REST_INTENSITY_THRESHOLD) continue
		score += m.intensity * (load.get(m.muscleGroup) ?? 0)
	}
	return score
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
