import { describe, expect, it } from 'vitest'
import { getAllUnits, isVolumeUnit, resolveUnitGrams } from './units'

/** Avocado: flesh-only macros, so `pcs` is the edible ~140 g, not the ~200 g whole fruit. */
const AVOCADO_UNITS = [
	{ name: 'g', grams: 1 },
	{ name: 'pcs', grams: 140 },
	{ name: 'medium', grams: 140 }
]

describe('resolveUnitGrams', () => {
	it('resolves g without a stored row', () => {
		expect(resolveUnitGrams('g', [], null)).toBe(1)
	})

	it('resolves a stored unit case-insensitively', () => {
		expect(resolveUnitGrams('PCS', AVOCADO_UNITS, null)).toBe(140)
	})

	it('derives volume units from density', () => {
		// Olive oil, 0.92 g/ml → 1 tbsp = 15 ml = 13.8 g
		expect(resolveUnitGrams('tbsp', [{ name: 'g', grams: 1 }], 0.92)).toBe(13.8)
	})

	it('prefers a stored unit over the density-derived one', () => {
		expect(resolveUnitGrams('tbsp', [{ name: 'tbsp', grams: 20 }], 0.92)).toBe(20)
	})

	it('returns null for a unit the ingredient does not have', () => {
		expect(resolveUnitGrams('scoop', AVOCADO_UNITS, null)).toBeNull()
		// Volume without density is unknowable, not a guess.
		expect(resolveUnitGrams('tbsp', AVOCADO_UNITS, null)).toBeNull()
	})

	it('prices a fractional amount off the edible weight', () => {
		const grams = resolveUnitGrams('pcs', AVOCADO_UNITS, null)
		expect(grams && grams * 0.5).toBe(70)
	})
})

describe('getAllUnits', () => {
	it('returns stored units untouched without a density', () => {
		expect(getAllUnits(AVOCADO_UNITS, null)).toEqual(AVOCADO_UNITS)
	})

	it('appends the density-derived volume units', () => {
		const units = getAllUnits([{ name: 'g', grams: 1 }], 1)
		expect(units.map(u => u.name)).toEqual(['g', 'ml', 'tsp', 'tbsp', 'dl', 'cup'])
	})

	it('does not duplicate a volume unit the ingredient already stores', () => {
		const units = getAllUnits([{ name: 'tbsp', grams: 20 }], 1)
		expect(units.filter(u => u.name === 'tbsp')).toHaveLength(1)
	})
})

describe('isVolumeUnit', () => {
	it.each(['ml', 'TSP', 'tbsp', 'dl', 'cup'])('recognises %s', name => {
		expect(isVolumeUnit(name)).toBe(true)
	})

	it.each(['g', 'pcs', 'scoop', 'large'])('rejects %s', name => {
		expect(isVolumeUnit(name)).toBe(false)
	})
})
