import type { Exercise } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import { buildSessionPlan, type PlannedExerciseRow } from './sessionPlan'
import type { SessionLog } from './sets'

type SessionExercise = SessionLog['exercise']

const exc = (id: string) => id as Exercise['id']

// Fixtures cast at the boundary — buildSessionPlan reads name/muscles/bwMultiplier
// from the exercise; logs only need exerciseId/setType linkage.
function makeExercise(
	id: string,
	name: string,
	muscles: Array<{ muscleGroup: string; intensity: number }> = []
): SessionExercise {
	return { id, name, muscles, bwMultiplier: 0, fatigueTier: 2 } as unknown as SessionExercise
}

function makeRow(overrides: Partial<PlannedExerciseRow> & { exerciseId: Exercise['id'] }): PlannedExerciseRow {
	return {
		sortOrder: 0,
		targetSets: 3,
		targetReps: 8,
		targetWeight: 80,
		setMode: 'working',
		trainingGoal: null,
		supersetGroup: null,
		exercise: makeExercise(overrides.exerciseId, overrides.exerciseId),
		...overrides
	}
}

function makeLog(id: string, exerciseId: Exercise['id']): SessionLog {
	return {
		id,
		exerciseId,
		setType: 'working',
		weightKg: 80,
		reps: 8,
		rpe: null,
		failureFlag: false,
		exercise: makeExercise(exerciseId, exerciseId)
	} as unknown as SessionLog
}

describe('buildSessionPlan', () => {
	it('generates planned sets per row and fills modes/goals maps', () => {
		const plan = buildSessionPlan({
			plannedExercises: [makeRow({ exerciseId: exc('exc_a'), targetSets: 3, targetReps: 8 })],
			logs: [],
			workoutGoal: 'hypertrophy'
		})

		expect(plan.exerciseGroups).toHaveLength(1)
		const item = plan.exerciseGroups[0]
		if (item.type !== 'standalone') throw new Error('expected standalone')
		expect(item.planned).toHaveLength(3)
		expect(item.goal).toBe('hypertrophy')
		expect(plan.modes.get(exc('exc_a'))).toBe('working')
		expect(plan.goals.get(exc('exc_a'))).toBe('hypertrophy')
	})

	it('warms up on a weight the gym actually has, and keeps the backoff on the plate grid', () => {
		const dumbbell = {
			...makeExercise(exc('exc_db'), 'DB Press'),
			equipment: [{ equipment: 'dumbbell' as const }]
		}
		const plan = buildSessionPlan({
			plannedExercises: [
				{
					...makeRow({ exerciseId: exc('exc_db'), targetSets: 3, targetReps: 10, targetWeight: 10 }),
					setMode: 'full',
					exercise: dumbbell
				}
			],
			logs: [],
			workoutGoal: 'hypertrophy',
			// Their rack: nothing between 5 and 6.5.
			ladders: { dumbbell: [5, 6.5, 8, 11.5, 12.5] }
		})

		const item = plan.exerciseGroups[0]
		if (item.type !== 'standalone') throw new Error('expected standalone')
		// 10kg × 0.6 = 6.0 → the rung they own, not the 6.0/6.25 that no rack holds.
		expect(item.planned[0]).toMatchObject({ setType: 'warmup', weightKg: 6.5 })
		// The backend prices this backoff on the grid, so the plan does too: 10 × 0.8 = 8.
		expect(item.planned.at(-1)).toMatchObject({ setType: 'backoff', weightKg: 8 })
	})

	it('drops the backoff off the last working set logged, not off the plan', () => {
		const rows = [
			{
				...makeRow({ exerciseId: exc('exc_a'), targetSets: 3, targetReps: 8, targetWeight: 10 }),
				setMode: 'backoff' as const
			}
		]
		// Planned 10 × 8; they loaded 12.5 and got 6 on the second set.
		const logs = [
			{ ...makeLog('log_1', exc('exc_a')), weightKg: 12.5, reps: 8 },
			{ ...makeLog('log_2', exc('exc_a')), weightKg: 12.5, reps: 6 }
		]

		const before = buildSessionPlan({ plannedExercises: rows, logs: [], workoutGoal: 'hypertrophy' })
		const after = buildSessionPlan({ plannedExercises: rows, logs, workoutGoal: 'hypertrophy' })
		for (const plan of [before, after]) {
			if (plan.exerciseGroups[0].type !== 'standalone') throw new Error('expected standalone')
		}
		const planned = (plan: typeof before) =>
			plan.exerciseGroups[0].type === 'standalone' ? plan.exerciseGroups[0].planned : []

		// Nothing logged yet: the row's own target is all there is to go on.
		expect(planned(before).at(-1)).toMatchObject({ setType: 'backoff', weightKg: 8, reps: 10 })
		// 80% of the 12.5 they actually did, +2 on the 6 reps that set came in at.
		expect(planned(after).at(-1)).toMatchObject({ setType: 'backoff', weightKg: 10, reps: 8 })
		// The working sets still show the plan — only the backoff follows the log.
		expect(planned(after)[0]).toMatchObject({ setType: 'working', weightKg: 10, reps: 8 })
	})

	it('per-exercise trainingGoal overrides the workout goal and drives defaults', () => {
		const plan = buildSessionPlan({
			plannedExercises: [
				makeRow({ exerciseId: exc('exc_a'), trainingGoal: 'strength', targetSets: null, targetReps: null })
			],
			logs: [],
			workoutGoal: 'hypertrophy'
		})

		const item = plan.exerciseGroups[0]
		if (item.type !== 'standalone') throw new Error('expected standalone')
		expect(item.goal).toBe('strength')
		// Strength defaults: 5 sets
		expect(item.planned).toHaveLength(5)
	})

	it('orders by sortOrder regardless of input order', () => {
		const plan = buildSessionPlan({
			plannedExercises: [
				makeRow({ exerciseId: exc('exc_b'), sortOrder: 2 }),
				makeRow({ exerciseId: exc('exc_a'), sortOrder: 1 })
			],
			logs: [],
			workoutGoal: 'hypertrophy'
		})

		expect(plan.exerciseGroups.map(g => (g.type === 'standalone' ? g.exerciseId : null))).toEqual([
			'exc_a',
			'exc_b'
		])
	})

	it('groups superset members; a lone member renders standalone', () => {
		const plan = buildSessionPlan({
			plannedExercises: [
				makeRow({ exerciseId: exc('exc_a'), sortOrder: 0, supersetGroup: 1 }),
				makeRow({ exerciseId: exc('exc_b'), sortOrder: 1, supersetGroup: 1 }),
				makeRow({ exerciseId: exc('exc_c'), sortOrder: 2, supersetGroup: 2 })
			],
			logs: [],
			workoutGoal: 'hypertrophy'
		})

		expect(plan.exerciseGroups).toHaveLength(2)
		expect(plan.exerciseGroups[0].type).toBe('superset')
		expect(plan.exerciseGroups[1].type).toBe('standalone')
	})

	it('logs attach to their planned exercise; unplanned exercises become extras', () => {
		const plan = buildSessionPlan({
			plannedExercises: [makeRow({ exerciseId: exc('exc_a') })],
			logs: [makeLog('wkl_1', exc('exc_a')), makeLog('wkl_2', exc('exc_extra'))],
			workoutGoal: 'hypertrophy'
		})

		const item = plan.exerciseGroups[0]
		if (item.type !== 'standalone') throw new Error('expected standalone')
		expect(item.logs.map(l => l.id)).toEqual(['wkl_1'])

		expect(plan.extraExercises).toHaveLength(1)
		expect(plan.extraExercises[0].logs.map(l => l.id)).toEqual(['wkl_2'])
		// Extras render as standalone items with no planned sets
		const extraItem = plan.exerciseGroups[1]
		if (extraItem.type !== 'standalone') throw new Error('expected standalone')
		expect(extraItem.planned).toEqual([])
		expect(plan.goals.get(exc('exc_extra'))).toBe('hypertrophy')
	})

	it('threads warmup dedup across exercises in sortOrder, not input order', () => {
		const muscles = [{ muscleGroup: 'triceps', intensity: 1.0 }]
		const plan = buildSessionPlan({
			plannedExercises: [
				makeRow({
					exerciseId: exc('exc_b'),
					sortOrder: 2,
					setMode: 'full',
					exercise: makeExercise('exc_b', 'B', muscles)
				}),
				makeRow({
					exerciseId: exc('exc_a'),
					sortOrder: 1,
					setMode: 'full',
					exercise: makeExercise('exc_a', 'A', muscles)
				})
			],
			logs: [],
			workoutGoal: 'hypertrophy'
		})

		const [first, second] = plan.exerciseGroups
		if (first.type !== 'standalone' || second.type !== 'standalone') throw new Error('expected standalone')
		// exc_a (lower sortOrder) runs first and gets the warmup ramp
		expect(first.exerciseId).toBe('exc_a')
		expect(first.planned.some(s => s.setType === 'warmup')).toBe(true)
		// exc_a fully warmed triceps — exc_b's ramp is skipped
		expect(second.planned.some(s => s.setType === 'warmup')).toBe(false)
	})

	it('applies template notes by exercise id', () => {
		const plan = buildSessionPlan({
			plannedExercises: [makeRow({ exerciseId: exc('exc_a') })],
			logs: [],
			workoutGoal: 'hypertrophy',
			notes: new Map([[exc('exc_a'), 'pause at the bottom']])
		})

		const item = plan.exerciseGroups[0]
		if (item.type !== 'standalone') throw new Error('expected standalone')
		expect(item.note).toBe('pause at the bottom')
	})
})
