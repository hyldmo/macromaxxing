import type { WorkoutSession } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'

export function assertWorkoutSessionOwner(
	session: Pick<WorkoutSession, 'userId'> | null | undefined,
	userId: string
): void {
	if (!session || session.userId !== userId) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
	}
}
