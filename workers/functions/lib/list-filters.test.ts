import { describe, expect, it } from 'vitest'
import { applyOffsetLimit, matchesExerciseFilters } from './list-filters'
import { escapeLikePattern } from './list-inputs'

describe('escapeLikePattern', () => {
	it('escapes LIKE wildcards and backslashes', () => {
		expect(escapeLikePattern('bench_press 50%')).toBe('bench\\_press 50\\%')
		expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
	})
})

describe('matchesExerciseFilters', () => {
	const press = {
		name: 'Bench Press',
		muscles: [{ muscleGroup: 'chest' as const }, { muscleGroup: 'triceps' as const }],
		equipment: [{ equipment: 'barbell' as const }, { equipment: 'bench_flat' as const }]
	}

	it('passes when no filters', () => {
		expect(matchesExerciseFilters(press, {})).toBe(true)
	})

	it('filters by muscleGroup', () => {
		expect(matchesExerciseFilters(press, { muscleGroup: 'chest' })).toBe(true)
		expect(matchesExerciseFilters(press, { muscleGroup: 'lats' })).toBe(false)
	})

	it('filters equipment with AND semantics', () => {
		expect(matchesExerciseFilters(press, { equipment: ['barbell'] })).toBe(true)
		expect(matchesExerciseFilters(press, { equipment: ['barbell', 'bench_flat'] })).toBe(true)
		expect(matchesExerciseFilters(press, { equipment: ['barbell', 'squat_rack'] })).toBe(false)
	})
})

describe('applyOffsetLimit', () => {
	const rows = [1, 2, 3, 4, 5]

	it('returns all from offset when limit omitted', () => {
		expect(applyOffsetLimit(rows, 2)).toEqual([3, 4, 5])
	})

	it('slices with limit', () => {
		expect(applyOffsetLimit(rows, 1, 2)).toEqual([2, 3])
	})
})
