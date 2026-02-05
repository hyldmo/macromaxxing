import type { AiProvider } from '@macromaxxing/db'
import z from 'zod'

export const macroSchema = z.object({
	protein: z.number().describe('Protein in grams per 100g'),
	carbs: z.number().describe('Carbohydrates in grams per 100g'),
	fat: z.number().describe('Fat in grams per 100g'),
	kcal: z.number().describe('Calories per 100g'),
	fiber: z.number().describe('Fiber in grams per 100g')
})

export const MODELS: Record<AiProvider, string> = {
	gemini: 'gemini-2.0-flash',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-5-haiku-20241022'
}
