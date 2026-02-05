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
