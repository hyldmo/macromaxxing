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

export const parsedRecipeSchema = z.object({
	name: z.string().describe('Recipe name/title'),
	ingredients: z
		.array(
			z.object({
				name: z.string().describe('Ingredient name, e.g. "flour", "chicken breast"'),
				amount: z.number().describe('Numeric amount'),
				unit: z
					.string()
					.describe(
						'Unit: "g", "tbsp", "cup", "pcs", "large", "medium", "small", "ml", "dl", "tsp", "scoop", etc.'
					)
			})
		)
		.describe('List of ingredients with amounts'),
	instructions: z.string().describe('Cooking instructions as plain text, preserving step numbering'),
	servings: z.number().nullable().describe('Number of servings/portions, null if not specified')
})

export const MODELS: Record<AiProvider, string> = {
	gemini: 'gemini-3-flash-preview',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-5-haiku-20241022'
}

export const FALLBACK_MODELS: Record<AiProvider, string[]> = {
	gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite-preview', 'gemma-3-27b-it'],
	openai: [],
	anthropic: []
}

export const batchIngredientAiSchema = z.array(
	z.object({
		name: z.string().describe('Ingredient name exactly as provided in the input'),
		protein: z.number().describe('Protein in grams per 100g'),
		carbs: z.number().describe('Carbohydrates in grams per 100g'),
		fat: z.number().describe('Fat in grams per 100g'),
		kcal: z.number().describe('Calories per 100g'),
		fiber: z.number().describe('Fiber in grams per 100g'),
		density: z.number().nullable().describe('g/ml for liquids and powders, null for solid items'),
		units: z.array(unitSchema).describe('Common units for measuring this ingredient with gram equivalents')
	})
)
