/**
 * Set-scheme math: what a template row actually prescribes.
 *
 * Shared between the frontend session planner (`src/lib/workouts/sets.ts`, which renders the
 * sets) and the Workers backend (`workout.generateBackoff`, plus the muscle-load aggregates that
 * price them). Keep it pure — no DB access, no I/O.
 */

import type { SetMode, SetType } from './custom-types'
import { roundWeight } from './formulas'

export interface GeneratedSet {
	weightKg: number
	reps: number
	setType: SetType
}

/**
 * Backoff sets: drop 20% of the load per step and add 2 reps. Bodyweight exercises
 * (`bwMultiplier > 0`) can't shed load, so they take the rep increase alone at +0 added kg.
 *
 * `workingWeight` is added kg (the same units as `workoutExercises.targetWeight`), not the
 * effective load.
 */
export function generateBackoffSets(
	workingWeight: number,
	workingReps: number,
	count = 2,
	bwMultiplier = 0
): GeneratedSet[] {
	const sets: GeneratedSet[] = []
	for (let i = 0; i < count; i++) {
		const reps = workingReps + 2 * (i + 1)
		if (bwMultiplier > 0) {
			sets.push({ weightKg: 0, reps, setType: 'backoff' })
			continue
		}
		sets.push({ weightKg: roundWeight(workingWeight * (0.8 - i * 0.1), 'kg', 'up'), reps, setType: 'backoff' })
	}
	return sets
}

/**
 * Invert the single planned backoff (80% round-up, +2 reps) back to a working
 * target so updatePlannedExercise regenerates the same backoff numbers.
 *
 * Returns null when the numbers aren't expressible as a backoff of any working
 * target (reps below 3) — callers reject the edit rather than snapping the user
 * to a value they didn't type.
 *
 * Bodyweight backoffs are always +0 kg, so their weight is NOT invertible — the
 * caller must not offer a weight edit there (see TimerModeView.canEditNextWeight).
 */
export function workingTargetsFromBackoff(
	backoffWeightKg: number | null,
	backoffReps: number,
	bwMultiplier = 0
): { weightKg: number | null; reps: number } | null {
	const reps = backoffReps - 2
	if (reps < 1) return null
	if (bwMultiplier > 0 || backoffWeightKg == null || backoffWeightKg <= 0) {
		return { weightKg: backoffWeightKg, reps }
	}
	// generateBackoffSets is ceil(0.8W / plate) * plate, so the largest grid weight
	// whose 80% still fits under the backoff inverts it exactly.
	return { weightKg: roundWeight(backoffWeightKg / 0.8, 'kg', 'down'), reps }
}

export interface TargetSetSplitInput {
	setMode: SetMode
	targetSets: number
	targetReps: number
	/** Added kg, or null when the row has no working weight yet. */
	targetWeight: number | null
	bwMultiplier?: number
}

export interface TargetSetSplit {
	/** Sets performed at the row's target load and reps. */
	workingCount: number
	/** The backoff folded into `targetSets`, or null when the mode or the data doesn't produce one. */
	backoff: GeneratedSet | null
}

/**
 * Split a row's `targetSets` into the working sets and the single backoff that `backoff`/`full`
 * modes fold into it.
 *
 * `targetSets` describes working sets *including* the backoff — warmups are additive and never
 * come out of it. Single source of truth so the session plan and the muscle-load aggregates can't
 * disagree about what a row prescribes. A backoff needs both reps and a load to be generated
 * (bodyweight rows always have one); without them the row is all working sets rather than
 * silently losing one.
 */
export function splitTargetSets({
	setMode,
	targetSets,
	targetReps,
	targetWeight,
	bwMultiplier = 0
}: TargetSetSplitInput): TargetSetSplit {
	const hasBackoff = setMode === 'backoff' || setMode === 'full'
	const canGenerateLoad = bwMultiplier > 0 || (targetWeight != null && targetWeight > 0)
	if (!hasBackoff || targetReps <= 0 || !canGenerateLoad) {
		return { workingCount: targetSets, backoff: null }
	}
	const [backoff] = generateBackoffSets(targetWeight ?? 0, targetReps, 1, bwMultiplier)
	return { workingCount: Math.max(1, targetSets - 1), backoff: backoff ?? null }
}
