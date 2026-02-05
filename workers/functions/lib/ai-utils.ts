import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { AiProvider } from '@macromaxxing/db'
import type { z } from 'zod'
import { MODELS, type macroSchema } from './constants'

// USDA nutrient IDs
const NUTRIENT_IDS = {
	protein: 1003,
	fat: 1004,
	carbs: 1005,
	kcal: 1008,
	fiber: 1079
} as const

export type Macros = z.infer<typeof macroSchema>

export function getModel(provider: AiProvider, apiKey: string) {
	switch (provider) {
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(MODELS.gemini)
		case 'openai':
			return createOpenAI({ apiKey })(MODELS.openai)
		case 'anthropic':
			return createAnthropic({ apiKey })(MODELS.anthropic)
	}
}

export async function lookupUSDA(ingredientName: string, apiKey: string): Promise<Macros | null> {
	const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
	url.searchParams.set('api_key', apiKey)
	url.searchParams.set('query', ingredientName)
	url.searchParams.set('pageSize', '5')
	// Prefer Foundation and SR Legacy (standard reference) for raw ingredients
	url.searchParams.set('dataType', 'Foundation,SR Legacy')

	const res = await fetch(url.toString())
	if (!res.ok) return null

	const data = (await res.json()) as {
		foods?: Array<{
			description: string
			foodNutrients?: Array<{ nutrientId: number; value: number }>
		}>
	}

	if (!data.foods?.length) return null

	// Use the first result
	const food = data.foods[0]
	const nutrients = food.foodNutrients ?? []

	const getNutrient = (id: number): number => nutrients.find(n => n.nutrientId === id)?.value ?? 0

	return {
		protein: getNutrient(NUTRIENT_IDS.protein),
		fat: getNutrient(NUTRIENT_IDS.fat),
		carbs: getNutrient(NUTRIENT_IDS.carbs),
		kcal: getNutrient(NUTRIENT_IDS.kcal),
		fiber: getNutrient(NUTRIENT_IDS.fiber)
	}
}

export const INGREDIENT_AI_PROMPT = `Return nutritional values per 100g raw weight for the ingredient.

Also provide common units for measuring this ingredient with their gram equivalents:
- For whole items (eggs, fruits, vegetables): include pcs, small, medium, large
- For supplements/protein powders: include scoop
- Do NOT include volume units (tbsp, tsp, cup, dl, ml) - these are calculated from density
- Always include "g" as a unit with grams=1
- Set isDefault=true for the most natural unit (e.g., "pcs" for eggs, "g" for flour, "scoop" for protein powder)

Include density in g/ml for liquids and powders (null for solid items like fruits or vegetables).`

// Volume units with their ml equivalents - used to calculate gram weights from density
export const VOLUME_UNITS = [
	{ name: 'ml', ml: 1 },
	{ name: 'tsp', ml: 5 },
	{ name: 'tbsp', ml: 15 },
	{ name: 'dl', ml: 100 },
	{ name: 'cup', ml: 240 }
] as const

export interface VolumeUnit {
	name: string
	grams: number
	isDefault: boolean
}

/** Calculate volume unit gram weights from density (g/ml) */
export function calculateVolumeUnits(density: number): VolumeUnit[] {
	return VOLUME_UNITS.map(unit => ({
		name: unit.name,
		grams: Math.round(unit.ml * density * 100) / 100, // Round to 2 decimal places
		isDefault: false
	}))
}
