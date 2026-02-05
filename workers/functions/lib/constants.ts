import type { AiProvider } from '@macromaxxing/db'
import z from 'zod'

export const macroSchema = z.object({
	protein: z.number().describe('Protein in grams per 100g'),
	carbs: z.number().describe('Carbohydrates in grams per 100g'),
	fat: z.number().describe('Fat in grams per 100g'),
	kcal: z.number().describe('Calories per 100g'),
	fiber: z.number().describe('Fiber in grams per 100g')
})

export const unitSchema = z.object({
	name: z.string().describe("Unit name: 'tbsp', 'tsp', 'cup', 'pcs', 'medium', 'large', 'scoop', etc."),
	grams: z.number().describe('Weight in grams per 1 unit'),
	isDefault: z.boolean().describe('true for the most natural unit (e.g., "pcs" for eggs, "g" for flour)')
})

export const ingredientAiSchema = z.object({
	protein: z.number().describe('Protein in grams per 100g'),
	carbs: z.number().describe('Carbohydrates in grams per 100g'),
	fat: z.number().describe('Fat in grams per 100g'),
	kcal: z.number().describe('Calories per 100g'),
	fiber: z.number().describe('Fiber in grams per 100g'),
	density: z.number().nullable().describe('g/ml for liquids and powders, null for solid items'),
	units: z.array(unitSchema).describe('Common units for measuring this ingredient with gram equivalents')
})

export const cookedWeightSchema = z.object({
	cookedWeight: z.number().describe('Estimated cooked weight in grams after typical cooking')
})

export const MODELS: Record<AiProvider, string> = {
	gemini: 'gemini-3-flash-preview',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-5-haiku-20241022'
}
