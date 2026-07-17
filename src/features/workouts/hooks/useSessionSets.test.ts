import type { Exercise } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import type { RouterInput, RouterOutput } from '~/lib/trpc'
import { isOptimisticLogId, withOptimisticLog, withPatchedLog, withServerLog } from './useSessionSets'

type SessionData = RouterOutput['workout']['getSession']
type SessionLog = SessionData['logs'][number]

const exc = (id: string) => id as Exercise['id']
const OPT = 'wkl_optimistic_test' as SessionLog['id']

// Fixtures cast at the boundary — the helpers only read logs/plannedExercises/
// workout.exercises linkage plus the exercise's bwMultiplier.
function makeExercise(id: string, bwMultiplier = 0): SessionLog['exercise'] {
	return { id, name: id, bwMultiplier, fatigueTier: 2, muscles: [] } as unknown as SessionLog['exercise']
}

function makeLog(id: string, exerciseId: string, overrides: Partial<SessionLog> = {}): SessionLog {
	return {
		id,
		sessionId: 'wks_1',
		exerciseId,
		setNumber: 1,
		setType: 'working',
		weightKg: 80,
		reps: 8,
		rpe: null,
		failureFlag: false,
		createdAt: 0,
		exercise: makeExercise(exerciseId),
		...overrides
	} as unknown as SessionLog
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
	return {
		id: 'wks_1',
		logs: [],
		plannedExercises: [],
		workout: null,
		...overrides
	} as unknown as SessionData
}

const ADD = {
	sessionId: 'wks_1',
	exerciseId: exc('exc_a'),
	weightKg: 100,
	reps: 5
} as RouterInput['workout']['addSet']

describe('isOptimisticLogId', () => {
	it('matches only optimistic ids', () => {
		expect(isOptimisticLogId('wkl_optimistic_123')).toBe(true)
		expect(isOptimisticLogId('wkl_abc123')).toBe(false)
	})
})

describe('withOptimisticLog', () => {
	it('resolves the exercise from an existing log and continues its set count', () => {
		const previous = makeSession({
			logs: [makeLog('wkl_1', 'exc_a'), makeLog('wkl_x', 'exc_other')]
		})
		const next = withOptimisticLog(previous, ADD, OPT, null)

		expect(next).not.toBeNull()
		const added = next!.logs.at(-1)!
		expect(added.id).toBe(OPT)
		// One existing exc_a log — the other exercise's log doesn't count
		expect(added.setNumber).toBe(2)
		expect(added.weightKg).toBe(100)
		expect(added.exercise).toBe(previous.logs[0].exercise)
	})

	it('falls back to the plan snapshot, then the template, for exercise data', () => {
		const fromPlan = makeSession({
			plannedExercises: [
				{ exerciseId: exc('exc_a'), exercise: makeExercise('exc_a') }
			] as unknown as SessionData['plannedExercises']
		})
		expect(withOptimisticLog(fromPlan, ADD, OPT, null)?.logs).toHaveLength(1)

		const fromTemplate = makeSession({
			workout: {
				exercises: [{ exerciseId: exc('exc_a'), exercise: makeExercise('exc_a') }]
			} as unknown as SessionData['workout']
		})
		expect(withOptimisticLog(fromTemplate, ADD, OPT, null)?.logs).toHaveLength(1)
	})

	it('unknown exercise → null, no optimistic entry', () => {
		expect(withOptimisticLog(makeSession(), ADD, OPT, null)).toBeNull()
	})

	it('stores effective load for bodyweight exercises', () => {
		const previous = makeSession({
			logs: [makeLog('wkl_1', 'exc_a', { exercise: makeExercise('exc_a', 1) })]
		})
		const next = withOptimisticLog(previous, ADD, OPT, 80)
		// 80kg bodyweight × 1 + 100 added
		expect(next!.logs.at(-1)!.weightKg).toBe(180)
	})
})

describe('withServerLog', () => {
	it('swaps the optimistic entry in place, keeping the loaded exercise, leaving others untouched', () => {
		const previous = makeSession({ logs: [makeLog('wkl_other', 'exc_b'), makeLog(OPT, 'exc_a')] })
		const server = {
			id: 'wkl_real',
			setNumber: 1,
			weightKg: 100,
			reps: 5
		} as unknown as RouterOutput['workout']['addSet']

		const next = withServerLog(previous, OPT, server)
		expect(next.logs.map(l => l.id)).toEqual(['wkl_other', 'wkl_real'])
		expect(next.logs[1].exercise).toBe(previous.logs[1].exercise)
		expect(next.logs[0]).toBe(previous.logs[0])
	})
})

describe('withPatchedLog', () => {
	it('patches only the provided fields', () => {
		const previous = makeSession({ logs: [makeLog('wkl_1', 'exc_a')] })
		const patch = { id: 'wkl_1', reps: 10 } as RouterInput['workout']['updateSet']

		const next = withPatchedLog(previous, patch, null)
		expect(next.logs[0].reps).toBe(10)
		expect(next.logs[0].weightKg).toBe(80)
		expect(next.logs[0].setType).toBe('working')
	})

	it('converts added kg to effective load via the log exercise bwMultiplier', () => {
		const previous = makeSession({
			logs: [makeLog('wkl_1', 'exc_a', { exercise: makeExercise('exc_a', 1) })]
		})
		const patch = { id: 'wkl_1', weightKg: 10 } as RouterInput['workout']['updateSet']

		const next = withPatchedLog(previous, patch, 80)
		// 80kg bodyweight × 1 + 10 added
		expect(next.logs[0].weightKg).toBe(90)
	})
})
