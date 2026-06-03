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
	exerciseId: string
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

	for (const [exerciseId, { name, logs: exLogs }] of byExercise) {
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
			stats.push({
				exerciseId,
				name,
				weightKg: bestWeight,
				reps: bestReps,
				e1rm: bestE1rm,
				volume: totalVolume(exLogs)
			})
		}
	}

	return stats.sort((a, b) => b.e1rm - a.e1rm)
}

// ─── Progression Detection ──────────────────────────────────────────

/** kg of e1RM tolerance for PR detection — below this, treat as float noise rather than a real PR */
export const E1RM_PR_TOLERANCE_KG = 0.5

/** Default relative gain over the last 3 sessions below which an exercise is considered stalled (2.5%) */
export const DEFAULT_STALL_THRESHOLD = 0.025

/**
 * Returns true iff this set's estimated 1RM beats `priorMaxE1rm` by more than the float-noise tolerance.
 * Bodyweight (weightKg <= 0) and zero-rep sets don't count as e1RM PRs — see `metricHierarchy` for the fallback.
 */
export function isE1rmPR(set: { weightKg: number; reps: number }, priorMaxE1rm: number): boolean {
	if (set.weightKg <= 0 || set.reps <= 0) return false
	return estimated1RM(set.weightKg, set.reps) > priorMaxE1rm + E1RM_PR_TOLERANCE_KG
}

/**
 * Returns true iff the last 3 entries of `sessionMaxE1rms` (oldest → newest) show <= `threshold` relative gain.
 * Returns false for: insufficient data (< 3 entries), bodyweight/invalid (first <= 0), or healthy progression.
 * Caller distinguishes "stalled" from "insufficient data" / "bodyweight" via separate logic.
 */
export function isStalledExercise(
	sessionMaxE1rms: ReadonlyArray<number>,
	threshold: number = DEFAULT_STALL_THRESHOLD
): boolean {
	if (sessionMaxE1rms.length < 3) return false
	const last3 = sessionMaxE1rms.slice(-3)
	const first = last3[0]
	const last = last3[last3.length - 1]
	if (first === undefined || last === undefined || first <= 0) return false
	return (last - first) / first <= threshold
}

export type ProgressionMetric =
	| { kind: 'e1rm'; value: number }
	| { kind: 'reps'; value: number }
	| { kind: 'recency'; value: null }

/**
 * Pick the appropriate progression metric for a set: e1RM (weighted) → reps (bodyweight) → recency (no data).
 * Lets callers render "last time" for bodyweight exercises without inventing fake e1RM values.
 */
export function metricHierarchy(set: { weightKg: number; reps: number }): ProgressionMetric {
	if (set.weightKg > 0 && set.reps > 0) {
		return { kind: 'e1rm', value: estimated1RM(set.weightKg, set.reps) }
	}
	if (set.weightKg === 0 && set.reps > 0) {
		return { kind: 'reps', value: set.reps }
	}
	return { kind: 'recency', value: null }
}

// ─── Time Windows ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

export type AnalyticsWindow = '4w' | '12w' | '1y' | 'all'

/** Fixed-length windows — everything except all-time, which has no preset cutoff. */
export type FixedAnalyticsWindow = Exclude<AnalyticsWindow, 'all'>

/** Window enum → milliseconds. Shared by analytics endpoints + `exerciseHistory`. */
export const WINDOW_CUTOFF_MS: Record<FixedAnalyticsWindow, number> = {
	'4w': 28 * DAY_MS,
	'12w': 84 * DAY_MS,
	'1y': 365 * DAY_MS
}

/**
 * Convert a window enum to a unix-epoch ms cutoff: sessions with `startedAt >= cutoff`
 * are in the window `[now - WINDOW_CUTOFF_MS[window], now)`. Pure helper — `now`
 * is injected for testability. The `all` window has no fixed cutoff: it returns 0
 * (epoch) so every session is included, and callers derive the real start from the
 * first logged session.
 */
export function windowSinceMs(window: AnalyticsWindow, now: number = Date.now()): number {
	if (window === 'all') return 0
	return now - WINDOW_CUTOFF_MS[window]
}

/** Format a unix-epoch ms timestamp as a UTC `YYYY-MM-DD` calendar date. */
export function utcDateKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}
