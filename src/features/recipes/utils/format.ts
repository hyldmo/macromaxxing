const FRACTIONS: [number, string][] = [
	[0.25, '\u00BC'],
	[0.5, '\u00BD'],
	[0.75, '\u00BE'],
	[0.333, '\u2153'],
	[0.667, '\u2154']
]

/** Format a numeric amount with nice fractions (½, ¼, ¾, ⅓, ⅔) */
export function formatAmount(value: number): string {
	if (value === 0) return '0'

	const whole = Math.floor(value)
	const frac = value - whole

	if (frac < 0.01) return whole.toString()

	for (const [threshold, symbol] of FRACTIONS) {
		if (Math.abs(frac - threshold) < 0.02) {
			return whole > 0 ? `${whole}${symbol}` : symbol
		}
	}

	// No nice fraction match — show decimal
	return value % 1 === 0 ? value.toString() : value.toFixed(1)
}

/** Format amount + unit for display, hiding "pcs" */
export function formatIngredientAmount(amount: number, unit: string): string {
	const formatted = formatAmount(amount)
	if (unit === 'pcs') return formatted
	return `${formatted} ${unit}`
}

// Unit math is shared with the server (`mealPlan.logMeal` resolves `{ amount, unit }` the same way),
// so it lives in @macromaxxing/db. Re-exported here so existing `../utils/format` imports keep working.
export { getAllUnits, resolveUnitGrams } from '@macromaxxing/db'
