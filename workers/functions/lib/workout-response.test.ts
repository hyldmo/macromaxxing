import { describe, expect, it } from 'vitest'
import {
	compactExerciseNesting,
	compactLocationNesting,
	compactSessionPayload,
	compactWorkoutPayload,
	stripVerboseSession,
	stripVerboseWorkout,
	toSessionListItem
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

describe('toSessionListItem', () => {
	const sessionLog = (setType: 'warmup' | 'working' | 'backoff', weightKg: number, reps: number) => ({
		exerciseId: 'exc_1',
		setType,
		weightKg,
		reps,
		exercise: fullExercise()
	})

	const session = () => ({
		id: 'wks_1',
		logs: [sessionLog('warmup', 40, 10), sessionLog('working', 100, 5), sessionLog('backoff', 80, 7)],
		location: { id: 'loc_1', name: 'Home', equipment: [{ equipment: 'barbell' as const }] }
	})

	it('attaches the rollup in both modes', () => {
		const summary = { setCount: 3, hardSetCount: 2, volumeKg: 1060 }
		expect(toSessionListItem(session(), true).summary).toMatchObject(summary)
		expect(toSessionListItem(session(), false).summary).toMatchObject(summary)
	})

	it('keeps the raw set rows when verbose', () => {
		const item = toSessionListItem(session(), true)
		expect(item.logs).toHaveLength(3)
		expect(item.location.equipment).toHaveLength(1)
	})

	it('drops the set rows and location equipment when not verbose', () => {
		const item = toSessionListItem(session(), false)
		expect(item.logs).toEqual([])
		expect(item.location.equipment).toEqual([])
		// The rollup must survive the sets it replaced — otherwise verbose:false silently loses data.
		expect(item.summary.exercises).toHaveLength(1)
		expect(item.summary.exercises[0]).toMatchObject({ name: 'Bench Press', sets: 3, hardSets: 2 })
	})

	it("leaves the source row's logs intact — only location is stripped in place", () => {
		const original = session()
		toSessionListItem(original, false)
		expect(original.logs).toHaveLength(3)
		// Documented: location is shared with the input and stripped in place, like the
		// rest of this module. Callers must not reuse the row afterwards.
		expect(original.location.equipment).toEqual([])
	})
})
