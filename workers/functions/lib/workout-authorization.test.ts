import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { assertWorkoutSessionOwner } from './workout-authorization'

describe('assertWorkoutSessionOwner', () => {
	it('accepts the authenticated owner', () => {
		expect(() => assertWorkoutSessionOwner({ userId: 'user_1' }, 'user_1')).not.toThrow()
	})

	it('hides a different user session', () => {
		expect(() => assertWorkoutSessionOwner({ userId: 'user_2' }, 'user_1')).toThrowError(
			new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
		)
	})
})
