import type { TrainingGoal } from '@macromaxxing/db'

export const TRAINING_DEFAULTS: Record<
	TrainingGoal,
	{
		rest: { warmup: number; working: number; backoff: number }
		targetSets: number
		targetReps: number
	}
> = {
	hypertrophy: {
		rest: { warmup: 45, working: 90, backoff: 60 },
		targetSets: 3,
		targetReps: 10
	},
	strength: {
		rest: { warmup: 60, working: 180, backoff: 90 },
		targetSets: 5,
		targetReps: 5
	}
}

const round = (w: number) => Math.round(w / 2.5) * 2.5

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
		const half = round(workingWeight * 0.5)
		if (half > 20) sets.push({ weightKg: half, reps: 5, setType: 'warmup' })
		const three4 = round(workingWeight * 0.75)
		if (three4 > half && workingWeight - three4 >= 5) {
			sets.push({ weightKg: three4, reps: 3, setType: 'warmup' })
		}
	} else {
		// Light/dumbbell: single set at ~60%
		const w = round(workingWeight * 0.6)
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
			weightKg: round(workingWeight * pct),
			reps: workingReps + 2 * (i + 1),
			setType: 'backoff'
		})
	}
	return sets
}
