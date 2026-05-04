/**
 * Pure workout-math primitives shared between the frontend (`src/`) and the
 * Cloudflare Workers backend (`workers/`). Lives in `@macromaxxing/db` because
 * that's the only workspace package both consume.
 *
 * Keep this file pure: no DB access, no side effects, no I/O. Inputs are
 * plain logs, outputs are numbers / arrays. If you need to add a helper that
 * touches Drizzle, it belongs in a route file, not here.
 */

/** Brzycki 1RM estimate: weight × 36 / (37 − reps), capped at 12 reps to avoid inflated estimates */
const BRZYCKI_REP_CAP = 12

export function estimated1RM(weightKg: number, reps: number): number {
	if (reps <= 0) return weightKg
	const capped = Math.min(reps, BRZYCKI_REP_CAP)
	return weightKg * (36 / (37 - capped))
}

/** Inverse Brzycki: working weight for a given 1RM and target reps */
export function weightForReps(oneRM: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return oneRM
	return oneRM * ((37 - reps) / 36)
}

/** Total volume = Σ(weight * reps) */
export function totalVolume(logs: Array<{ weightKg: number; reps: number; sets?: number }>): number {
	return logs.reduce((sum, { weightKg, reps, sets = 1 }) => sum + weightKg * reps * sets, 0)
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
