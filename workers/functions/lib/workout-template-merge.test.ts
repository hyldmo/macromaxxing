import { describe, expect, it } from 'vitest'
import {
	buildTemplateExercisePatch,
	type ExistingWorkoutExerciseRow,
	planWorkoutExerciseMerge
} from './workout-template-merge'

const row = (
	partial: Partial<ExistingWorkoutExerciseRow> & Pick<ExistingWorkoutExerciseRow, 'id' | 'exerciseId'>
): ExistingWorkoutExerciseRow => ({
	targetSets: 3,
	targetReps: 8,
	targetWeight: 60,
	setMode: 'working',
	trainingGoal: null,
	supersetGroup: null,
	note: 'cue: elbows in',
	...partial
})

describe('planWorkoutExerciseMerge', () => {
	it('preserves note when patch omits it', () => {
		const existing = [row({ id: 'wke_a', exerciseId: 'exc_1' })]
		const plan = planWorkoutExerciseMerge(existing, [{ id: 'wke_a', exerciseId: 'exc_1', targetWeight: 65 }])
		expect(plan.updates).toHaveLength(1)
		expect(plan.updates[0].values.note).toBe('cue: elbows in')
		expect(plan.updates[0].values.targetWeight).toBe(65)
		expect(plan.inserts).toEqual([])
		expect(plan.deleteIds).toEqual([])
	})

	it('clears field when patch sends null', () => {
		const existing = [row({ id: 'wke_a', exerciseId: 'exc_1' })]
		const plan = planWorkoutExerciseMerge(existing, [
			{ id: 'wke_a', exerciseId: 'exc_1', note: null, targetWeight: null }
		])
		expect(plan.updates[0].values.note).toBeNull()
		expect(plan.updates[0].values.targetWeight).toBeNull()
	})

	it('rejects unknown wke id', () => {
		expect(() => planWorkoutExerciseMerge([], [{ id: 'wke_missing', exerciseId: 'exc_1' }])).toThrow(/not found/)
	})

	it('rejects duplicate wke ids in incoming list', () => {
		const existing = [row({ id: 'wke_a', exerciseId: 'exc_1' })]
		expect(() =>
			planWorkoutExerciseMerge(existing, [
				{ id: 'wke_a', exerciseId: 'exc_1' },
				{ id: 'wke_a', exerciseId: 'exc_1' }
			])
		).toThrow(/Duplicate/)
	})

	it('inserts rows without id', () => {
		const plan = planWorkoutExerciseMerge([], [{ exerciseId: 'exc_new', targetSets: 4 }])
		expect(plan.inserts).toEqual([
			{
				exerciseId: 'exc_new',
				sortOrder: 0,
				targetSets: 4,
				targetReps: null,
				targetWeight: null,
				setMode: 'working',
				trainingGoal: null,
				supersetGroup: null,
				note: null
			}
		])
		expect(plan.updates).toEqual([])
		expect(plan.deleteIds).toEqual([])
	})

	it('deletes orphan rows not in incoming set', () => {
		const existing = [
			row({ id: 'wke_keep', exerciseId: 'exc_1' }),
			row({ id: 'wke_gone', exerciseId: 'exc_2', note: 'bye' })
		]
		const plan = planWorkoutExerciseMerge(existing, [{ id: 'wke_keep', exerciseId: 'exc_1' }])
		expect(plan.deleteIds).toEqual(['wke_gone'])
		expect(plan.updates).toHaveLength(1)
		expect(plan.updates[0].id).toBe('wke_keep')
	})

	it('assigns sortOrder from incoming array index', () => {
		const existing = [row({ id: 'wke_a', exerciseId: 'exc_1' }), row({ id: 'wke_b', exerciseId: 'exc_2' })]
		const plan = planWorkoutExerciseMerge(existing, [
			{ id: 'wke_b', exerciseId: 'exc_2' },
			{ id: 'wke_a', exerciseId: 'exc_1' }
		])
		expect(plan.updates.find(u => u.id === 'wke_b')?.values.sortOrder).toBe(0)
		expect(plan.updates.find(u => u.id === 'wke_a')?.values.sortOrder).toBe(1)
	})
})

describe('buildTemplateExercisePatch', () => {
	it('returns null for empty patch', () => {
		expect(buildTemplateExercisePatch({})).toBeNull()
	})

	it('trims note and clears empty string to null', () => {
		expect(buildTemplateExercisePatch({ note: '  hello  ' })).toEqual({ note: 'hello' })
		expect(buildTemplateExercisePatch({ note: '   ' })).toEqual({ note: null })
		expect(buildTemplateExercisePatch({ note: null })).toEqual({ note: null })
	})

	it('includes only defined keys', () => {
		expect(buildTemplateExercisePatch({ targetWeight: 100, setMode: 'full' })).toEqual({
			targetWeight: 100,
			setMode: 'full'
		})
	})
})
