import type { Sex } from '@macromaxxing/db'

/** Brzycki 1RM estimate: weight * 36 / (37 - reps) */
export function estimated1RM(weightKg: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return weightKg
	return weightKg * (36 / (37 - reps))
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
export function totalVolume(logs: Array<{ weightKg: number; reps: number }>): number {
	return logs.reduce((sum, l) => sum + l.weightKg * l.reps, 0)
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
