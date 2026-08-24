import { workoutLogs, workoutSessions } from '@macromaxxing/db'
import { and, count, eq, gte, isNotNull, ne } from 'drizzle-orm'
import type { Database } from './db'

/**
 * How far back `activityLevel: 'auto'` looks. Four weeks is long enough that a deload or a
 * travel week doesn't swing the bracket, short enough that a real change in training shows up
 * within a month.
 */
export const TRAINING_FREQUENCY_WINDOW_DAYS = 28

const WINDOW_MS = TRAINING_FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000

/**
 * Completed sessions per week over the trailing window — the signal `auto` resolves against.
 * Only completed sessions count: an abandoned session isn't training that happened.
 */
export async function trainingSessionsPerWeek(db: Database, userId: string): Promise<number> {
	const count = await db.$count(
		workoutSessions,
		and(
			eq(workoutSessions.userId, userId),
			isNotNull(workoutSessions.completedAt),
			gte(workoutSessions.startedAt, Date.now() - WINDOW_MS)
		)
	)
	return count / (TRAINING_FREQUENCY_WINDOW_DAYS / 7)
}

/**
 * Hard sets per week over the same trailing window — the signal the carbohydrate floor scales on.
 *
 * Deliberately a separate count from `trainingSessionsPerWeek`, which drives the TDEE bracket. A
 * session is the unit for "how active is this person"; a hard set is the unit for "how much
 * glycogen did they spend", and the two diverge sharply here (5-set arm days and 15-set leg days
 * both count as one session).
 *
 * Hard set = every non-warmup set, matching `isHardSet` and every other volume surface, so
 * backoffs count. Only completed sessions, for the same reason as above.
 */
export async function trainingHardSetsPerWeek(db: Database, userId: string): Promise<number> {
	const [row] = await db
		.select({ hardSets: count() })
		.from(workoutLogs)
		.innerJoin(workoutSessions, eq(workoutLogs.sessionId, workoutSessions.id))
		.where(
			and(
				eq(workoutSessions.userId, userId),
				isNotNull(workoutSessions.completedAt),
				gte(workoutSessions.startedAt, Date.now() - WINDOW_MS),
				ne(workoutLogs.setType, 'warmup')
			)
		)
	return (row?.hardSets ?? 0) / (TRAINING_FREQUENCY_WINDOW_DAYS / 7)
}
