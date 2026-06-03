/**
 * Analytics endpoints — read-only aggregates over a user's workout history.
 *
 * Tenant scoping: every endpoint MUST drive its query FROM `workout_sessions
 * WHERE userId = ctx.user.id` (or filter via the loaded session entity), never
 * from `workout_logs` directly. Logs alone have no userId; joining the wrong
 * way around would leak across tenants.
 */
import {
	estimated1RM,
	isE1rmPR,
	isStalledExercise,
	MUSCLE_GROUPS,
	type MuscleGroup,
	type TypeIDString,
	utcDateKey,
	WINDOW_CUTOFF_MS,
	windowSinceMs
} from '@macromaxxing/db'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const windowInput = z.object({ window: z.enum(['4w', '12w', '1y', 'all']).default('12w') })

const RECENT_PRS_CAP = 30

export const analyticsRouter = router({
	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// Trade-off: "prior max" is computed from sets WITHIN the window only, not all-time.
	// Consequence: the first session-per-exercise inside the window may register a false
	// PR if the user lifted heavier outside the window. This keeps the implementation
	// to a single query; if the false-positive rate is annoying in practice, swap to
	// a two-step (all-time max BEFORE window → walk in-window).
	recentPRs: protectedProcedure
		.meta({
			description: 'Recent personal records: list of new e1RM PRs in the time window, oldest → newest'
		})
		.input(windowInput)
		.query(async ({ ctx, input }) => {
			const since = windowSinceMs(input.window)

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: {
					logs: {
						where: { setType: 'working' },
						with: { exercise: true },
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { startedAt: 'asc' }
			})

			type ExerciseId = TypeIDString<'exc'>
			type SessionId = TypeIDString<'wks'>
			type PR = {
				exerciseId: ExerciseId
				exerciseName: string
				sessionId: SessionId
				startedAt: number
				weightKg: number
				reps: number
				e1rm: number
				deltaFromPrior: number
			}

			const prs: PR[] = []
			const runningMaxByExercise = new Map<ExerciseId, number>()

			for (const session of sessions) {
				for (const log of session.logs) {
					if (log.weightKg <= 0 || log.reps <= 0) continue
					const prior = runningMaxByExercise.get(log.exerciseId) ?? 0
					if (!isE1rmPR(log, prior)) continue
					const e1rm = estimated1RM(log.weightKg, log.reps)
					prs.push({
						exerciseId: log.exerciseId,
						exerciseName: log.exercise.name,
						sessionId: session.id,
						startedAt: session.startedAt,
						weightKg: log.weightKg,
						reps: log.reps,
						e1rm,
						deltaFromPrior: e1rm - prior
					})
					runningMaxByExercise.set(log.exerciseId, e1rm)
				}
			}

			// Cap at RECENT_PRS_CAP — keep the most recent N (user wants "what's new").
			// `prs` is already in chronological (oldest → newest) order, so slice the tail.
			if (prs.length > RECENT_PRS_CAP) return prs.slice(prs.length - RECENT_PRS_CAP)
			return prs
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	stalledExercises: protectedProcedure
		.meta({
			description: 'Exercises that have stalled — no e1RM gain over the last 3 working sessions'
		})
		.input(windowInput)
		.query(async ({ ctx, input }) => {
			const since = windowSinceMs(input.window)

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: {
					logs: {
						where: { setType: 'working' },
						with: { exercise: true }
					}
				},
				orderBy: { startedAt: 'asc' }
			})

			type ExerciseId = TypeIDString<'exc'>
			type SessionRecord = { sessionId: TypeIDString<'wks'>; startedAt: number; maxE1rm: number }
			const byExercise = new Map<ExerciseId, { name: string; sessions: SessionRecord[] }>()

			for (const session of sessions) {
				// Group this session's logs by exercise so we can compute one max e1RM per
				// (session, exercise) pair instead of treating each set independently.
				const perExercise = new Map<ExerciseId, { name: string; max: number }>()
				for (const log of session.logs) {
					const e1rm = log.weightKg > 0 && log.reps > 0 ? estimated1RM(log.weightKg, log.reps) : 0
					const cur = perExercise.get(log.exerciseId)
					if (!cur || e1rm > cur.max) perExercise.set(log.exerciseId, { name: log.exercise.name, max: e1rm })
				}
				for (const [exerciseId, { name, max }] of perExercise) {
					let entry = byExercise.get(exerciseId)
					if (!entry) {
						entry = { name, sessions: [] }
						byExercise.set(exerciseId, entry)
					}
					entry.sessions.push({ sessionId: session.id, startedAt: session.startedAt, maxE1rm: max })
				}
			}

			const stalled: Array<{
				exerciseId: ExerciseId
				exerciseName: string
				lastSessionAt: number
				currentMaxE1rm: number
				sessionsTracked: number
			}> = []

			for (const [exerciseId, { name, sessions: exSessions }] of byExercise) {
				if (exSessions.length < 3) continue
				const e1rms = exSessions.map(s => s.maxE1rm)
				// Skip bodyweight-only exercises — every session has e1RM 0, can't be "stalled" by e1RM definition.
				if (e1rms.every(v => v === 0)) continue
				if (!isStalledExercise(e1rms)) continue
				const last3 = exSessions.slice(-3)
				const currentMaxE1rm = Math.max(...last3.map(s => s.maxE1rm))
				const lastSessionAt = last3[last3.length - 1].startedAt
				stalled.push({
					exerciseId,
					exerciseName: name,
					lastSessionAt,
					currentMaxE1rm,
					sessionsTracked: 3
				})
			}

			stalled.sort((a, b) => b.lastSessionAt - a.lastSessionAt)
			return stalled
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	topExercises: protectedProcedure
		.meta({ description: 'Top exercises by working-set count over the time window' })
		.input(windowInput.extend({ limit: z.number().int().min(1).max(50).default(10) }))
		.query(async ({ ctx, input }) => {
			const since = windowSinceMs(input.window)

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: {
					logs: {
						where: { setType: 'working' },
						with: { exercise: true }
					}
				}
			})

			type ExerciseId = TypeIDString<'exc'>
			type SessionId = TypeIDString<'wks'>
			const stats = new Map<
				ExerciseId,
				{ name: string; workingSetCount: number; sessions: Set<SessionId>; lastSessionAt: number }
			>()

			for (const session of sessions) {
				for (const log of session.logs) {
					let s = stats.get(log.exerciseId)
					if (!s) {
						s = { name: log.exercise.name, workingSetCount: 0, sessions: new Set(), lastSessionAt: 0 }
						stats.set(log.exerciseId, s)
					}
					s.workingSetCount += 1
					s.sessions.add(session.id)
					if (session.startedAt > s.lastSessionAt) s.lastSessionAt = session.startedAt
				}
			}

			const out = Array.from(stats.entries()).map(([exerciseId, s]) => ({
				exerciseId,
				exerciseName: s.name,
				workingSetCount: s.workingSetCount,
				sessionCount: s.sessions.size,
				lastSessionAt: s.lastSessionAt
			}))
			// Tied counts → break by exerciseId ASC for deterministic ordering.
			out.sort((a, b) => b.workingSetCount - a.workingSetCount || a.exerciseId.localeCompare(b.exerciseId))
			return out.slice(0, input.limit)
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// Compares the current window against the immediately prior window of the same length.
	// One row per muscle group (not per week — see analytics-plan.md).
	weeklyTrend: protectedProcedure
		.meta({
			description: 'Per-muscle-group weekly working-set volume over the time window with delta vs prior period'
		})
		.input(windowInput)
		.query(async ({ ctx, input }) => {
			const now = Date.now()
			// 'all' has no prior period — current spans the user's whole history and prior is empty,
			// so deltas read as the full all-time totals against a zero baseline.
			const currentStart = input.window === 'all' ? 0 : now - WINDOW_CUTOFF_MS[input.window]
			const priorStart = input.window === 'all' ? 0 : now - 2 * WINDOW_CUTOFF_MS[input.window]
			// Pull both periods in one query; bucket per session in JS.
			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: priorStart } },
				with: {
					logs: {
						where: { setType: 'working' },
						with: { exercise: { with: { muscles: true } } }
					}
				}
			})

			type Period = { sets: number; volume: number }
			const empty = (): Period => ({ sets: 0, volume: 0 })
			const perMuscle = new Map<MuscleGroup, { current: Period; prior: Period }>()
			const get = (mg: MuscleGroup) => {
				let entry = perMuscle.get(mg)
				if (!entry) {
					entry = { current: empty(), prior: empty() }
					perMuscle.set(mg, entry)
				}
				return entry
			}

			for (const session of sessions) {
				// Current = [now - cutoff, now); prior = [now - 2*cutoff, now - cutoff).
				// Sessions older than priorStart are already filtered by the `gte: priorStart` query.
				const isCurrent = session.startedAt >= currentStart
				for (const log of session.logs) {
					for (const m of log.exercise.muscles) {
						const bucket = isCurrent ? get(m.muscleGroup).current : get(m.muscleGroup).prior
						bucket.sets += m.intensity
						bucket.volume += log.weightKg * log.reps * m.intensity
					}
				}
			}

			const out = Array.from(perMuscle.entries()).map(([muscleGroup, { current, prior }]) => ({
				muscleGroup,
				currentSets: current.sets,
				priorSets: prior.sets,
				deltaSets: current.sets - prior.sets,
				currentVolume: current.volume,
				priorVolume: prior.volume
			}))
			out.sort((a, b) => b.currentSets - a.currentSets)
			return out
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// Day buckets are UTC `YYYY-MM-DD` for consistency across clients in different timezones;
	// the frontend can re-bucket to local time if needed.
	calendarHeatmap: protectedProcedure
		.meta({ description: 'Per-day training density: working-set count per calendar day in the time window' })
		.input(windowInput)
		.query(async ({ ctx, input }) => {
			const since = windowSinceMs(input.window)

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: {
					logs: {
						where: { setType: 'working' }
					}
				}
			})

			type SessionId = TypeIDString<'wks'>
			const perDay = new Map<string, { workingSetCount: number; sessions: Set<SessionId> }>()

			for (const session of sessions) {
				if (session.logs.length === 0) continue
				const date = utcDateKey(session.startedAt)
				let bucket = perDay.get(date)
				if (!bucket) {
					bucket = { workingSetCount: 0, sessions: new Set() }
					perDay.set(date, bucket)
				}
				bucket.workingSetCount += session.logs.length
				bucket.sessions.add(session.id)
			}

			const out = Array.from(perDay.entries()).map(([date, { workingSetCount, sessions: ses }]) => ({
				date,
				workingSetCount,
				sessionCount: ses.size
			}))
			out.sort((a, b) => a.date.localeCompare(b.date))
			return out
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// Per-week (Monday-aligned UTC) volume by muscle group, weighted by exercise-muscle intensity.
	// Output is a fixed grid: one entry per ISO week from window-start Monday → current Monday,
	// even when no sessions fell in a given week. The fixed grid is what makes the data shape
	// usable for a stacked bar chart without client-side gap filling.
	weeklyVolumeByMuscle: protectedProcedure
		.meta({
			description:
				'Weekly per-muscle volume time series (kg·reps × intensity), Monday-aligned UTC weeks across the time window'
		})
		.input(windowInput)
		.query(async ({ ctx, input }) => {
			const now = Date.now()

			// Monday-anchored UTC week start for any timestamp.
			const WEEK_MS = 7 * 24 * 60 * 60 * 1000
			const mondayUtc = (ms: number): number => {
				const d = new Date(ms)
				// Date#getUTCDay: 0 = Sunday … 6 = Saturday. Map to days-since-Monday (Mon=0…Sun=6).
				const dow = (d.getUTCDay() + 6) % 7
				return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * 24 * 60 * 60 * 1000
			}

			// Fixed windows query from the window's start Monday. 'all' pulls the full history
			// (gte 0) and derives the grid start from the earliest logged session below.
			const queryStart = input.window === 'all' ? 0 : mondayUtc(now - WINDOW_CUTOFF_MS[input.window])

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: queryStart } },
				with: {
					logs: {
						where: { setType: 'working' },
						with: { exercise: { with: { muscles: true } } }
					}
				}
			})

			const endMonday = mondayUtc(now)
			const startMonday =
				input.window === 'all'
					? sessions.length > 0
						? mondayUtc(Math.min(...sessions.map(s => s.startedAt)))
						: endMonday
					: queryStart
			const weekKeys: string[] = []
			for (let t = startMonday; t <= endMonday; t += WEEK_MS) {
				weekKeys.push(utcDateKey(t))
			}

			type Volumes = Partial<Record<MuscleGroup, number>>
			const perWeek = new Map<string, Volumes>()
			for (const key of weekKeys) perWeek.set(key, {})

			for (const session of sessions) {
				const key = utcDateKey(mondayUtc(session.startedAt))
				const bucket = perWeek.get(key)
				if (!bucket) continue
				for (const log of session.logs) {
					const setVolume = log.weightKg * log.reps
					if (setVolume <= 0) continue
					for (const m of log.exercise.muscles) {
						bucket[m.muscleGroup] = (bucket[m.muscleGroup] ?? 0) + setVolume * m.intensity
					}
				}
			}

			return weekKeys.map(weekStart => {
				const volumes = perWeek.get(weekStart) ?? {}
				let total = 0
				for (const mg of MUSCLE_GROUPS) total += volumes[mg] ?? 0
				return { weekStart, volumes, totalVolume: total }
			})
		})
})
