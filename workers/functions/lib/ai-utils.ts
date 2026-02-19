import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError } from '@ai-sdk/provider'
import { type AiProvider, type HttpsUrl, usdaFoods, usdaPortions } from '@macromaxxing/db'
import { type GenerateTextResult, generateText, type Output } from 'ai'
import { eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { FALLBACK_MODELS, MODELS, type macroSchema } from './constants'
import type { Database } from './db'
import { extractPreparation } from './utils'

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

export function getModelByName(provider: AiProvider, apiKey: string, modelName: string) {
	switch (provider) {
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(modelName)
		case 'openai':
			return createOpenAI({ apiKey })(modelName)
		case 'anthropic':
			return createAnthropic({ apiKey })(modelName)
	}
}

export async function generateTextWithFallback<T extends Output.Output>({
	provider,
	apiKey,
	output,
	prompt,
	fallback
}: {
	provider: AiProvider
	apiKey: string
	output: T
	prompt: string
	fallback: boolean
}): Promise<GenerateTextResult<any, T>> {
	const models = [MODELS[provider], ...(fallback ? FALLBACK_MODELS[provider] : [])]

	for (let i = 0; i < models.length; i++) {
		try {
			return await generateText({
				model: getModelByName(provider, apiKey, models[i]),
				output,
				prompt,
				maxRetries: 0
			})
		} catch (err) {
			const isLast = i === models.length - 1
			if (isLast || !APICallError.isInstance(err) || err.statusCode !== 429) {
				throw err
			}
			// 429 and we have more models to try — continue
		}
	}

	// Unreachable, but TypeScript needs it
	throw new Error('No models available')
}

/** Score how well a USDA food description matches a search query */
export function scoreUsdaMatch(query: string, description: string): number {
	const queryWords = query.toLowerCase().split(/\s+/)
	const descWords = description
		.toLowerCase()
		.split(/[\s,]+/)
		.filter(Boolean)
	const matched = queryWords.filter(qw => descWords.includes(qw)).length
	if (matched === 0) return 0
	const startsWithQuery = descWords[0] === queryWords[0] ? 100 : 0
	const extraWords = descWords.length - matched
	return matched * 100 + startsWithQuery - extraWords * 10 - description.length
}

export type UsdaResult = Macros & { fdcId: number; description: string }

/** Search USDA and return all scored results (sorted by relevance, limited to top N) */
export async function searchUSDA(query: string, apiKey: string, limit = 5): Promise<UsdaResult[]> {
	const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
	url.searchParams.set('api_key', apiKey)
	url.searchParams.set('query', query)
	url.searchParams.set('pageSize', '10')
	// Foundation/SR Legacy for raw ingredients, FNDDS for common foods (milk, bread, etc.)
	url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS)')

	const res = await fetch(url.toString())
	if (!res.ok) return []

	const data = (await res.json()) as {
		foods?: Array<{
			fdcId: number
			description: string
			foodNutrients?: Array<{ nutrientId: number; value: number }>
		}>
	}

	if (!data.foods?.length) return []

	const getNutrient = (nutrients: Array<{ nutrientId: number; value: number }>, id: number): number =>
		nutrients.find(n => n.nutrientId === id)?.value ?? 0

	return data.foods
		.map(food => ({
			fdcId: food.fdcId,
			description: food.description,
			score: scoreUsdaMatch(query, food.description),
			protein: getNutrient(food.foodNutrients ?? [], NUTRIENT_IDS.protein),
			fat: getNutrient(food.foodNutrients ?? [], NUTRIENT_IDS.fat),
			carbs: getNutrient(food.foodNutrients ?? [], NUTRIENT_IDS.carbs),
			kcal: getNutrient(food.foodNutrients ?? [], NUTRIENT_IDS.kcal),
			fiber: getNutrient(food.foodNutrients ?? [], NUTRIENT_IDS.fiber)
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ score: _, ...rest }) => rest)
}

export async function lookupUSDA(ingredientName: string, apiKey: string): Promise<UsdaResult | null> {
	const results = await searchUSDA(ingredientName, apiKey, 1)
	return results[0] ?? null
}

// Known unit names we recognize from USDA portion modifiers
const KNOWN_UNITS = new Set(['cup', 'tbsp', 'tsp', 'oz', 'lb', 'ml', 'dl', 'pcs', 'slice', 'large', 'medium', 'small'])

export interface UsdaPortion {
	name: string
	grams: number
}

/** Fetch food portions from USDA detail endpoint and normalize to usable units */
export async function fetchUsdaPortions(fdcId: number, apiKey: string): Promise<UsdaPortion[]> {
	const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`)
	if (!res.ok) return []

	const data = (await res.json()) as {
		foodPortions?: Array<{
			modifier: string
			gramWeight: number
			amount: number
		}>
	}

	if (!data.foodPortions?.length) return []

	const units: UsdaPortion[] = []
	const seen = new Set<string>()

	for (const p of data.foodPortions) {
		const name = p.modifier?.toLowerCase().trim()
		if (!(name && p.gramWeight && p.amount)) continue
		// Only keep recognized unit names, skip things like "package (10 oz)"
		if (!KNOWN_UNITS.has(name)) continue
		if (seen.has(name)) continue
		seen.add(name)
		units.push({ name, grams: Math.round((p.gramWeight / p.amount) * 100) / 100 })
	}

	return units
}

// Volume units with their ml equivalents - used to calculate gram weights from density
export const VOLUME_UNITS = [
	{ name: 'ml', ml: 1 },
	{ name: 'tsp', ml: 5 },
	{ name: 'tbsp', ml: 15 },
	{ name: 'dl', ml: 100 },
	{ name: 'cup', ml: 240 }
] as const

const VOLUME_ML: Map<string, number> = new Map(VOLUME_UNITS.map(u => [u.name, u.ml]))

/** Calculate density (g/ml) from USDA portions that are volume-based */
export function densityFromPortions(portions: UsdaPortion[]): number | null {
	for (const p of portions) {
		const ml = VOLUME_ML.get(p.name)
		if (ml) return Math.round((p.grams / ml) * 1000) / 1000
	}
	return null
}

/** Check if a unit name is a volume unit (derivable from density) */
export function isVolumeUnit(name: string): boolean {
	return VOLUME_ML.has(name.toLowerCase())
}

export const INGREDIENT_AI_PROMPT = `Return nutritional values per 100g raw weight for the ingredient.

Also provide common units for measuring this ingredient with their gram equivalents:
- For whole items (eggs, fruits, vegetables): include pcs, small, medium, large
- For supplements/protein powders: include scoop
- Do NOT include volume units (tbsp, tsp, cup, dl, ml) - these are calculated from density
- Always include "g" as a unit with grams=1
- Set isDefault=true for the most natural unit (e.g., "pcs" for eggs, "g" for flour, "scoop" for protein powder)

Include density in g/ml for liquids and powders (null for solid items like fruits or vegetables).`

export const BATCH_INGREDIENT_AI_PROMPT = `Return nutritional values per 100g raw weight for each ingredient below.
Return an array of objects in the SAME ORDER as the input ingredients.

For each ingredient, provide:
- Macros per 100g (protein, carbs, fat, kcal, fiber)
- density in g/ml for liquids and powders (null for solid items)
- Common measurement units with gram equivalents:
  - For whole items (eggs, fruits, vegetables): include pcs, small, medium, large
  - For supplements/protein powders: include scoop
  - Do NOT include volume units (tbsp, tsp, cup, dl, ml) - these are calculated from density
  - Always include "g" as a unit with grams=1
  - Set isDefault=true for the most natural unit (e.g., "pcs" for eggs, "g" for flour, "scoop" for protein powder)`

// --- Recipe parsing utilities ---

const INGREDIENT_PATTERNS = [
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*tbsp\s+(.+)/i, unit: 'tbsp' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*tsp\s+(.+)/i, unit: 'tsp' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*cups?\s+(.+)/i, unit: 'cup' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*dl\s+(.+)/i, unit: 'dl' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*ml\s+(.+)/i, unit: 'ml' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*(?:pcs?|pieces?)\s+(.+)/i, unit: 'pcs' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*scoops?\s+(.+)/i, unit: 'scoop' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*small\s+(.+)/i, unit: 'small' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*medium\s+(.+)/i, unit: 'medium' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*large\s+(.+)/i, unit: 'large' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*(?:oz|ounces?)\s+(.+)/i, unit: 'oz' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*(?:lbs?|pounds?)\s+(.+)/i, unit: 'lb' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*kg\s+(.+)/i, unit: 'kg' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s*g(?:rams?)?\s+(.+)/i, unit: 'g' },
	{ pattern: /(\d+(?:[.,/]\d+)?)\s+(.+)/i, unit: 'pcs' }
]

function parseFraction(str: string): number {
	if (str.includes('/')) {
		const [num, den] = str.split('/')
		return Number(num) / Number(den)
	}
	return Number(str.replace(',', '.'))
}

/** Parse a single ingredient string like "2 tbsp sugar" or "1/2 cup flour" */
export function parseIngredientString(
	text: string
): { name: string; amount: number; unit: string; preparation: string | null } | null {
	const trimmed = text
		.trim()
		.replace(/^[-*\u2022]\s*/, '') // strip bullet markers
		.replace(/\(.*?\)/g, '') // strip parentheticals like "(about 2 cups)"
		.trim()
	if (!trimmed) return null

	for (const { pattern, unit } of INGREDIENT_PATTERNS) {
		const match = trimmed.match(pattern)
		if (match) {
			const amount = parseFraction(match[1])
			const rawName = match[2].trim().replace(/,\s*$/, '')
			if (!Number.isNaN(amount) && rawName) {
				const { name, preparation } = extractPreparation(rawName)
				return { name, amount, unit, preparation }
			}
		}
	}

	// Reverse pattern: "flour 500g"
	const reverseMatch = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g?$/i)
	if (reverseMatch) {
		const amount = Number(reverseMatch[2])
		if (!Number.isNaN(amount)) {
			const { name, preparation } = extractPreparation(reverseMatch[1].trim())
			return { name, amount, unit: 'g', preparation }
		}
	}

	return null
}

export interface JsonLdRecipe {
	name: string
	ingredientStrings: string[]
	instructions: string
	servings: number | null
	image: HttpsUrl | null
}

/** Extract Recipe structured data from JSON-LD script tags in HTML */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
	const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

	for (const match of html.matchAll(scriptRegex)) {
		try {
			const data = JSON.parse(match[1])
			const recipe = findRecipeInJsonLd(data)
			if (recipe) return recipe
		} catch {
			// Invalid JSON-LD block, skip
		}
	}
	return null
}

function findRecipeInJsonLd(data: unknown): JsonLdRecipe | null {
	if (Array.isArray(data)) {
		for (const item of data) {
			const found = findRecipeInJsonLd(item)
			if (found) return found
		}
		return null
	}

	if (typeof data !== 'object' || data === null) return null

	const obj = data as Record<string, unknown>

	if (obj['@graph']) {
		return findRecipeInJsonLd(obj['@graph'])
	}

	const type = obj['@type']
	const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))

	if (isRecipe) {
		const ingredientStrings = Array.isArray(obj.recipeIngredient) ? (obj.recipeIngredient as string[]) : []
		if (ingredientStrings.length === 0) return null

		// Extract image (string, array of strings, or { url: string } per schema.org)
		let image: string | null = null
		if (typeof obj.image === 'string') {
			image = obj.image
		} else if (Array.isArray(obj.image) && typeof obj.image[0] === 'string') {
			image = obj.image[0]
		} else if (typeof obj.image === 'object' && obj.image !== null && 'url' in obj.image) {
			image = (obj.image as { url: string }).url
		}

		return {
			name: (obj.name as string) || 'Untitled Recipe',
			ingredientStrings,
			instructions: normalizeInstructions(obj.recipeInstructions),
			servings: parseServings(obj.recipeYield),
			image: image as HttpsUrl | null
		}
	}

	return null
}

function normalizeInstructions(instructions: unknown): string {
	if (typeof instructions === 'string') return instructions
	if (Array.isArray(instructions)) {
		return instructions
			.map(step => {
				if (typeof step === 'string') return step
				if (typeof step === 'object' && step !== null && 'text' in step) return (step as { text: string }).text
				return ''
			})
			.filter(Boolean)
			.join('\n')
	}
	return ''
}

function parseServings(yieldValue: unknown): number | null {
	if (typeof yieldValue === 'number') return yieldValue
	if (typeof yieldValue === 'string') {
		const match = yieldValue.match(/(\d+)/)
		return match ? Number(match[1]) : null
	}
	if (Array.isArray(yieldValue)) return parseServings(yieldValue[0])
	return null
}

// --- Product parsing utilities ---

export interface JsonLdProduct {
	name: string
	servingSize: number
	servings: number | null
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
}

/** Parse nutrition strings like "21 g", "240 calories", "5g" → extract the number */
function parseNutritionValue(value: unknown): number | null {
	if (typeof value === 'number') return value
	if (typeof value !== 'string') return null
	const match = value.match(/([\d.]+)/)
	return match ? Number(match[1]) : null
}

/** Extract Product structured data with NutritionInformation from JSON-LD script tags */
export function extractJsonLdProduct(html: string): JsonLdProduct | null {
	const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

	for (const match of html.matchAll(scriptRegex)) {
		try {
			const data = JSON.parse(match[1])
			const product = findProductInJsonLd(data)
			if (product) return product
		} catch {
			// Invalid JSON-LD block, skip
		}
	}
	return null
}

function findProductInJsonLd(data: unknown): JsonLdProduct | null {
	if (Array.isArray(data)) {
		for (const item of data) {
			const found = findProductInJsonLd(item)
			if (found) return found
		}
		return null
	}

	if (typeof data !== 'object' || data === null) return null

	const obj = data as Record<string, unknown>

	if (obj['@graph']) {
		return findProductInJsonLd(obj['@graph'])
	}

	const type = obj['@type']
	const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))

	if (isProduct && obj.nutrition && typeof obj.nutrition === 'object') {
		const nutrition = obj.nutrition as Record<string, unknown>
		const servingSize = parseNutritionValue(nutrition.servingSize)
		if (!servingSize) return null

		return {
			name: (obj.name as string) || 'Unknown Product',
			servingSize,
			servings: parseNutritionValue(nutrition.numberOfServings),
			protein: parseNutritionValue(nutrition.proteinContent) ?? 0,
			carbs: parseNutritionValue(nutrition.carbohydrateContent) ?? 0,
			fat: parseNutritionValue(nutrition.fatContent) ?? 0,
			kcal: parseNutritionValue(nutrition.calories) ?? 0,
			fiber: parseNutritionValue(nutrition.fiberContent) ?? 0
		}
	}

	return null
}

// ─── Local USDA Lookup ──────────────────────────────────────────────

/** Search local usda_foods table using FTS5 full-text search */
export async function searchLocalUSDA(db: Database, query: string, limit = 5): Promise<UsdaResult[]> {
	const words = query.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return []

	// FTS5 query: each word as a prefix match, all must appear
	const ftsQuery = words.map(w => `"${w}"*`).join(' ')

	const rows = await db.all<{
		fdc_id: number
		description: string
		protein: number
		carbs: number
		fat: number
		kcal: number
		fiber: number
	}>(sql`
		SELECT f.fdc_id, f.description, f.protein, f.carbs, f.fat, f.kcal, f.fiber
		FROM usda_foods_fts fts
		JOIN usda_foods f ON f.fdc_id = fts.rowid
		WHERE usda_foods_fts MATCH ${ftsQuery}
		LIMIT 50
	`)

	const scored = rows
		.map(row => ({
			fdcId: row.fdc_id,
			description: row.description,
			score: scoreUsdaMatch(query, row.description),
			protein: row.protein,
			carbs: row.carbs,
			fat: row.fat,
			kcal: row.kcal,
			fiber: row.fiber
		}))
		.sort((a, b) => b.score - a.score)

	// Deduplicate by description (Foundation has multiple samples per food)
	const seen = new Set<string>()
	const deduped: typeof scored = []
	for (const row of scored) {
		const key = row.description.toLowerCase()
		if (!seen.has(key)) {
			seen.add(key)
			deduped.push(row)
		}
	}

	return deduped.slice(0, limit).map(({ score: _, ...rest }) => rest)
}

/** Exact case-insensitive match on local usda_foods table */
export async function lookupLocalUSDA(db: Database, name: string): Promise<UsdaResult | null> {
	const row = await db.query.usdaFoods.findFirst({
		where: sql`lower(${usdaFoods.description}) = lower(${name})`
	})
	if (!row) return null
	return {
		fdcId: row.fdcId,
		description: row.description,
		protein: row.protein,
		carbs: row.carbs,
		fat: row.fat,
		kcal: row.kcal,
		fiber: row.fiber
	}
}

/** Lookup a food by fdcId from local usda_foods table */
export async function getLocalUsdaFood(
	db: Database,
	fdcId: number
): Promise<{
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
	density: number | null
} | null> {
	const row = await db.query.usdaFoods.findFirst({
		where: eq(usdaFoods.fdcId, fdcId)
	})
	if (!row) return null
	return {
		protein: row.protein,
		carbs: row.carbs,
		fat: row.fat,
		kcal: row.kcal,
		fiber: row.fiber,
		density: row.density
	}
}

/** Fetch portions for a food from local usda_portions table */
export async function fetchLocalUsdaPortions(db: Database, fdcId: number): Promise<UsdaPortion[]> {
	const rows = await db.query.usdaPortions.findMany({
		where: eq(usdaPortions.fdcId, fdcId)
	})
	return rows.map(r => ({ name: r.name, grams: r.grams }))
}

/** Strip HTML tags and collapse whitespace for AI fallback */
export function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replace(/&#?\w+;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}
