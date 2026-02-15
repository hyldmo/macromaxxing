import { MUSCLE_GROUPS, type MuscleGroup } from '@macromaxxing/db'
import type { RouterOutput } from '~/lib/trpc'

type Exercise = RouterOutput['workout']['listExercises'][number]

export interface ScoredExercise {
	exercise: Exercise
	score: number
}

function toVector(muscles: Exercise['muscles']): number[] {
	const map = new Map<MuscleGroup, number>()
	for (const m of muscles) map.set(m.muscleGroup, m.intensity)
	return MUSCLE_GROUPS.map(g => map.get(g) ?? 0)
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0
	let magA = 0
	let magB = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		magA += a[i] * a[i]
		magB += b[i] * b[i]
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB)
	return denom === 0 ? 0 : dot / denom
}

export function rankBySimilarity(
	source: Exercise,
	allExercises: Exercise[],
	excludeIds: Set<string>
): ScoredExercise[] {
	const sourceVec = toVector(source.muscles)
	return allExercises
		.filter(e => !excludeIds.has(e.id))
		.map(exercise => {
			const muscleScore = cosineSimilarity(sourceVec, toVector(exercise.muscles))
			const typeMultiplier = exercise.type === source.type ? 1.0 : 0.5
			return { exercise, score: muscleScore * typeMultiplier }
		})
		.sort((a, b) => b.score - a.score)
}
