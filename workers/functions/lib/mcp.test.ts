import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { deriveAnnotations, extractMcpTools, procedurePathToToolName, serializeToolResult } from './mcp'
import { appRouter } from './router'

describe('serializeToolResult', () => {
	it('returns OK for void procedure results', () => {
		expect(serializeToolResult(undefined)).toBe('OK')
	})

	it('JSON-stringifies defined values', () => {
		expect(serializeToolResult({ id: 'wkl_01', weightKg: 11.5 })).toBe(
			JSON.stringify({ id: 'wkl_01', weightKg: 11.5 }, null, 2)
		)
	})

	it('JSON-stringifies null (distinct from void)', () => {
		expect(serializeToolResult(null)).toBe('null')
	})
})

describe('MCP mutations', () => {
	it('documents all MCP-exposed mutations', () => {
		const tools = extractMcpTools(appRouter)
		const procedures = (appRouter as any)._def.procedures as Record<string, { _def: { type: string } }>
		const mutations = tools.filter(t => procedures[t.procedurePath]?._def?.type === 'mutation')
		expect(mutations.map(t => t.name).sort()).toMatchInlineSnapshot(`
			[
			  "ai_lookup",
			  "ai_parseRecipe",
			  "ingredient_create",
			  "ingredient_findOrCreate",
			  "mealPlan_addToInventory",
			  "mealPlan_allocate",
			  "mealPlan_create",
			  "mealPlan_delete",
			  "mealPlan_removeFromInventory",
			  "mealPlan_removeSlot",
			  "mealPlan_update",
			  "recipe_addIngredient",
			  "recipe_create",
			  "recipe_delete",
			  "recipe_removeIngredient",
			  "recipe_update",
			  "recipe_updateIngredient",
			  "workout_addSet",
			  "workout_completeSession",
			  "workout_createExercise",
			  "workout_createProgram",
			  "workout_createSession",
			  "workout_createWorkout",
			  "workout_deleteExercise",
			  "workout_deleteGuide",
			  "workout_deleteProgram",
			  "workout_deleteSession",
			  "workout_deleteWorkout",
			  "workout_importSets",
			  "workout_importWorkouts",
			  "workout_removeSet",
			  "workout_reorderPrograms",
			  "workout_reorderWorkouts",
			  "workout_replaceSessionExercise",
			  "workout_setActiveProgram",
			  "workout_updateExercise",
			  "workout_updateExerciseNote",
			  "workout_updatePlannedExercise",
			  "workout_updateProgram",
			  "workout_updateSessionNotes",
			  "workout_updateSet",
			  "workout_updateWorkout",
			  "workout_upsertGuide",
			]
		`)
	})
})

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

describe('deriveAnnotations', () => {
	it('queries are read-only, non-destructive, and idempotent by default', () => {
		expect(deriveAnnotations('recipe.list', 'query', {})).toEqual({
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		})
	})

	it('non-delete mutations are not flagged destructive', () => {
		const ann = deriveAnnotations('recipe.create', 'mutation', {})
		expect(ann.readOnlyHint).toBe(false)
		expect(ann.destructiveHint).toBe(false)
	})

	it('delete*/remove* mutations are flagged destructive', () => {
		expect(deriveAnnotations('recipe.delete', 'mutation', {}).destructiveHint).toBe(true)
		expect(deriveAnnotations('recipe.removeIngredient', 'mutation', {}).destructiveHint).toBe(true)
	})

	it('create*/add* mutations are flagged non-idempotent', () => {
		expect(deriveAnnotations('recipe.create', 'mutation', {}).idempotentHint).toBe(false)
		expect(deriveAnnotations('recipe.addIngredient', 'mutation', {}).idempotentHint).toBe(false)
	})

	it('delete/remove/update/set/upsert/save/reorder mutations are flagged idempotent', () => {
		expect(deriveAnnotations('recipe.delete', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('recipe.removeIngredient', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('recipe.update', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('workout.setActiveProgram', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('workout.upsertGuide', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('settings.save', 'mutation', {}).idempotentHint).toBe(true)
		expect(deriveAnnotations('workout.reorderWorkouts', 'mutation', {}).idempotentHint).toBe(true)
	})

	it('ambiguous mutations leave idempotent unset', () => {
		expect(deriveAnnotations('workout.completeSession', 'mutation', {}).idempotentHint).toBeUndefined()
		expect(deriveAnnotations('ai.parseRecipe', 'mutation', {}).idempotentHint).toBeUndefined()
	})

	it('meta overrides win over the default', () => {
		// e.g. a mutation that's actually idempotent
		expect(deriveAnnotations('settings.save', 'mutation', { idempotent: true }).idempotentHint).toBe(true)
		// e.g. a mutation that we want to mark read-only because it's a no-op cache warmer
		expect(deriveAnnotations('foo.bar', 'mutation', { readOnly: true }).readOnlyHint).toBe(true)
		// override destructive default
		expect(deriveAnnotations('recipe.delete', 'mutation', { destructive: false }).destructiveHint).toBe(false)
	})

	it('extracted tools carry annotations consistent with their procedure type', () => {
		const tools = extractMcpTools(appRouter)
		const list = tools.find(t => t.name === 'recipe_list')
		expect(list?.annotations.readOnlyHint).toBe(true)
		const del = tools.find(t => t.name === 'recipe_delete')
		expect(del?.annotations.readOnlyHint).toBe(false)
		expect(del?.annotations.destructiveHint).toBe(true)
	})
})

// Guard against a recurring footgun: `z.custom()` has no JSON Schema
// representation, so any MCP-exposed tRPC input that uses it makes tools/call
// throw "Custom types cannot be represented in JSON Schema" at runtime.
describe('extractMcpTools input schemas', () => {
	it('every exposed tool has a Zod schema that converts to JSON Schema', () => {
		const tools = extractMcpTools(appRouter)
		for (const tool of tools) {
			if (!tool.zodSchema) continue
			expect(() => z.toJSONSchema(tool.zodSchema as z.ZodType), `tool ${tool.name}`).not.toThrow()
		}
	})
})
