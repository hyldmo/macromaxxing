import { describe, expect, it } from 'vitest'
import { getSourceUrl } from './ingredient-source'

describe('getSourceUrl', () => {
	it('builds a USDA FoodData Central URL from a numeric fdcId string', () => {
		expect(getSourceUrl('usda', '173410')).toBe('https://fdc.nal.usda.gov/food-details/173410')
	})

	it('builds an Open Food Facts URL from a barcode, preserving leading zeros', () => {
		expect(getSourceUrl('openfoodfacts', '0123456789012')).toBe(
			'https://world.openfoodfacts.org/product/0123456789012'
		)
	})

	it('returns null for sources with no external record', () => {
		expect(getSourceUrl('manual', null)).toBeNull()
		expect(getSourceUrl('ai', null)).toBeNull()
	})

	it('returns null when sourceId is missing for a known source', () => {
		expect(getSourceUrl('usda', null)).toBeNull()
	})
})
