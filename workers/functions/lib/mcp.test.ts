import { describe, expect, it } from 'vitest'
import { procedurePathToToolName } from './mcp'

describe('procedurePathToToolName', () => {
	it('converts dot-separated path to underscore', () => {
		expect(procedurePathToToolName('recipe.list')).toBe('recipe_list')
	})

	it('handles nested paths', () => {
		expect(procedurePathToToolName('workout.muscleGroupStats')).toBe('workout_muscleGroupStats')
	})

	it('handles single-segment paths', () => {
		expect(procedurePathToToolName('dashboard')).toBe('dashboard')
	})
})
