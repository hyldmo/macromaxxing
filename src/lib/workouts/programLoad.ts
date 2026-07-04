import {
	type BalanceRatio,
	computeBalances,
	computeMuscleLoad,
	effectiveSetWeightKg,
	type MuscleContribution,
	type MuscleLoadTotals,
	type MuscleLoadWithZone,
	sumTotals,
	type TrainingGoal,
	withZones
} from '@macromaxxing/db'
import type { RouterOutput } from '~/lib/trpc'

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]

export interface ProgramLoad {
	muscles: MuscleLoadWithZone[]
	totals: MuscleLoadTotals
	balances: BalanceRatio[]
	belowMev: MuscleLoadWithZone[]
	exerciseCount: number
}

/**
 * Aggregate muscle load across all workouts in a program — assumes one full
 * cycle is completed per planning window. Mirrors the server-side
 * `workoutMuscleLoad` shape but loops across multiple templates.
 */
export function computeProgramLoad(
	workouts: readonly WorkoutTemplate[],
	bodyWeightKg: number | null = null
): ProgramLoad {
	const contributions: MuscleContribution[] = []
	let exerciseCount = 0
	for (const workout of workouts) {
		for (const we of workout.exercises) {
			exerciseCount++
			const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
			const sets = we.targetSets ?? (goal === 'strength' ? 5 : 3)
			const targetWeight = we.targetWeight
			const weightKg =
				targetWeight != null
					? effectiveSetWeightKg(we.exercise.bwMultiplier, bodyWeightKg, targetWeight)
					: undefined
			for (const m of we.exercise.muscles) {
				contributions.push({
					muscleGroup: m.muscleGroup,
					intensity: m.intensity,
					sets,
					reps: we.targetReps ?? undefined,
					weightKg,
					exerciseType: we.exercise.type,
					fatigueTier: we.exercise.fatigueTier,
					trainingGoal: goal
				})
			}
		}
	}
	const loads = computeMuscleLoad(contributions)
	const muscles = withZones(loads)
	return {
		muscles,
		totals: sumTotals(loads),
		balances: computeBalances(loads),
		belowMev: muscles.filter(m => m.zone === 'below_mev' && m.workingSets > 0),
		exerciseCount
	}
}
