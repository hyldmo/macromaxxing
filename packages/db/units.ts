/**
 * Ingredient measurement units — the one place a `{ amount, unit }` pair turns into grams.
 *
 * A unit's `grams` is **edible weight on the same basis as the ingredient's per-100 g macros**:
 * `1 pcs` avocado is the ~140 g of flesh, not the ~200 g fruit you put on the scale with skin and
 * pit. The macros are flesh-only, so a whole-fruit gram value silently overstates every logged
 * piece by the weight of the parts you throw away. Same rule for bone-in meat, shell-on prawns,
 * peel-on citrus. Where an ingredient really is eaten whole (egg without shell is the convention),
 * edible weight and market weight coincide and there's nothing to subtract.
 */

/** Volume units with their ml equivalents — gram weights are derived from the ingredient's density. */
export const VOLUME_UNITS = [
	{ name: 'ml', ml: 1 },
	{ name: 'tsp', ml: 5 },
	{ name: 'tbsp', ml: 15 },
	{ name: 'dl', ml: 100 },
	{ name: 'cup', ml: 240 }
] as const

const VOLUME_ML: Map<string, number> = new Map(VOLUME_UNITS.map(u => [u.name, u.ml]))

/** Check if a unit name is a volume unit (derivable from density, so never stored). */
export function isVolumeUnit(name: string): boolean {
	return VOLUME_ML.has(name.toLowerCase())
}

/**
 * Get all units for an ingredient, including the volume units its density implies.
 *
 * Volume units are computed rather than stored — one density gives all five, and storing them
 * would let a density edit drift away from the rows derived from it.
 */
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

/**
 * Grams in one `unitName` of this ingredient, or null when the unit is unknown to it.
 *
 * `g` is always 1 and never needs a stored row. Everything else resolves against the ingredient's
 * own units first, then the density-derived volume units — so an ingredient that stores its own
 * `tbsp` wins over the generic 15 ml × density.
 */
export function resolveUnitGrams(
	unitName: string,
	storedUnits: { name: string; grams: number }[],
	density: number | null
): number | null {
	const name = unitName.trim().toLowerCase()
	if (name === 'g') return 1

	const stored = storedUnits.find(u => u.name.toLowerCase() === name)
	if (stored) return stored.grams

	const ml = VOLUME_ML.get(name)
	if (ml && density) return Math.round(ml * density * 100) / 100

	return null
}
