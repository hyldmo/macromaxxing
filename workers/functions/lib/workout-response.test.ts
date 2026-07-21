import { describe, expect, it } from 'vitest'
import {
	compactExerciseNesting,
	compactLocationNesting,
	compactSessionPayload,
	compactWorkoutPayload,
	stripVerboseSession,
	stripVerboseWorkout
} from './workout-response'

const fullExercise = () => ({
	id: 'exc_1',
	name: 'Bench Press',
	type: 'compound' as const,
	muscles: [{ muscleGroup: 'chest' as const, intensity: 1 }],
	equipment: [{ equipment: 'barbell' as const }]
})

describe('compactExerciseNesting', () => {
	it('returns full object when verbose', () => {
		const exercise = fullExercise()
		expect(compactExerciseNesting(exercise, true)).toBe(exercise)
	})

	it('empties muscles and equipment when not verbose', () => {
		expect(compactExerciseNesting(fullExercise(), false)).toEqual({
			...fullExercise(),
			muscles: [],
			equipment: []
		})
	})
})

describe('compactLocationNesting', () => {
	const location = {
		id: 'loc_1',
		name: 'Home',
		equipment: [{ equipment: 'dumbbell' as const }]
	}

	it('returns null for null location', () => {
		expect(compactLocationNesting(null, false)).toBeNull()
	})

	it('empties equipment when not verbose', () => {
		expect(compactLocationNesting(location, false)).toEqual({ ...location, equipment: [] })
	})
})

describe('stripVerboseWorkout / compactWorkoutPayload', () => {
	it('mutates nested muscle/equipment lists in place', () => {
		const workout = {
			id: 'wkt_1',
			name: 'Push',
			exercises: [
				{
					id: 'wke_1',
					exerciseId: 'exc_1',
					note: 'keep',
					exercise: fullExercise()
				}
			],
			location: {
				id: 'loc_1',
				name: 'Gym',
				equipment: [{ equipment: 'bench_flat' as const }]
			}
		}
		stripVerboseWorkout(workout)
		expect(workout.exercises[0].exercise.muscles).toEqual([])
		expect(workout.exercises[0].exercise.equipment).toEqual([])
		expect(workout.exercises[0].note).toBe('keep')
		expect(workout.location.equipment).toEqual([])
	})

	it('compactWorkoutPayload clones before stripping', () => {
		const workout = {
			exercises: [{ exercise: fullExercise() }],
			location: { equipment: [{ equipment: 'barbell' as const }] }
		}
		const compact = compactWorkoutPayload(workout, false)
		expect(compact.exercises?.[0].exercise.muscles).toEqual([])
		expect(workout.exercises[0].exercise.muscles).toHaveLength(1)
		expect(compactWorkoutPayload(workout, true)).toBe(workout)
	})
})

describe('stripVerboseSession / compactSessionPayload', () => {
	it('compacts workout, logs, plannedExercises, and location', () => {
		const session = {
			id: 'wks_1',
			workout: {
				id: 'wkt_1',
				exercises: [{ id: 'wke_1', exercise: fullExercise() }],
				location: { id: 'loc_w', name: 'From template', equipment: [{ equipment: 'barbell' as const }] }
			},
			location: { id: 'loc_1', name: 'Session loc', equipment: [{ equipment: 'barbell' as const }] },
			logs: [{ id: 'wkl_1', exercise: fullExercise() }],
			plannedExercises: [{ id: 'spe_1', exercise: fullExercise() }]
		}
		stripVerboseSession(session)
		expect(session.logs[0].exercise.muscles).toEqual([])
		expect(session.plannedExercises[0].exercise.muscles).toEqual([])
		expect(session.location.equipment).toEqual([])
		expect(session.workout.exercises[0].exercise.muscles).toEqual([])
	})

	it('compactSessionPayload clones before stripping', () => {
		const session = {
			logs: [{ exercise: fullExercise() }],
			plannedExercises: [{ exercise: fullExercise() }]
		}
		const compact = compactSessionPayload(session, false)
		expect(compact.logs?.[0].exercise.muscles).toEqual([])
		expect(session.logs[0].exercise.muscles).toHaveLength(1)
	})
})
