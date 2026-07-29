import { workoutSessions } from '@macromaxxing/db'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
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
