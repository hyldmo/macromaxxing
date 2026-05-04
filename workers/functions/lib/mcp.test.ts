import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractMcpTools, procedurePathToToolName } from './mcp'
import { appRouter } from './router'

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
