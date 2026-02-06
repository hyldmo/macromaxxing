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

// Volume units with their ml equivalents — must match backend VOLUME_UNITS
const VOLUME_UNITS = [
	{ name: 'ml', ml: 1 },
	{ name: 'tsp', ml: 5 },
	{ name: 'tbsp', ml: 15 },
	{ name: 'dl', ml: 100 },
	{ name: 'cup', ml: 240 }
] as const

/** Get all units for an ingredient, including volume units computed from density */
export function getAllUnits<T extends { name: string }>(
	storedUnits: T[],
	density: number | null
): (T | { name: string; grams: number })[] {
	if (!density) return storedUnits
	const existingNames = new Set(storedUnits.map(u => u.name.toLowerCase()))
	const volumeUnits = VOLUME_UNITS.filter(vu => !existingNames.has(vu.name)).map(vu => ({
		name: vu.name,
		grams: Math.round(vu.ml * density * 100) / 100
	}))
	return [...storedUnits, ...volumeUnits]
}
