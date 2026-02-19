import { extractPreparation } from '@macromaxxing/db'

/**
 * Converts a string to Start Case (first letter of each word capitalized)
 * Examples:
 * - "chicken breast" → "Chicken Breast"
 * - "OLIVE OIL" → "Olive Oil"
 * - "  pasta  " → "Pasta"
 */
export const toStartCase = (str: string): string =>
	str
		.trim()
		.toLowerCase()
		.replace(/\b\w/g, c => c.toUpperCase())

/** Normalize an ingredient name: extract preparation (discard it) + Start Case */
export const normalizeIngredientName = (name: string): string => toStartCase(extractPreparation(name).name)
