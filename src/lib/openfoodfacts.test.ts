import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidBarcode, lookupBarcode, type OFFProduct, offUnits } from './openfoodfacts'

function mockOFF(product: Record<string, unknown>) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ status: 1, product })))
	)
}

const product = (over: Partial<OFFProduct> = {}): OFFProduct => ({
	name: 'x',
	brand: null,
	servingSize: null,
	servingUnit: null,
	servings: null,
	packageSize: null,
	perServing: { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0 },
	per100g: { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0 },
	barcode: '1',
	...over
})

afterEach(() => vi.unstubAllGlobals())

describe('isValidBarcode', () => {
	it('accepts 8-13 digits and rejects anything else', () => {
		expect(isValidBarcode('7038010072291')).toBe(true)
		expect(isValidBarcode('1234567')).toBe(false)
		expect(isValidBarcode('12345678901234')).toBe(false)
		expect(isValidBarcode('abcdefgh')).toBe(false)
	})
})

describe('lookupBarcode', () => {
	it('reports the serving OFF declared, in the unit OFF declared it in', async () => {
		mockOFF({
			product_name: 'Iskaffe Protein Latte',
			brands: 'TINE',
			serving_quantity: 330,
			serving_quantity_unit: 'ml',
			nutriments: { proteins_100g: 1.72727272727273, 'energy-kcal_100g': 14.2424242424242 }
		})

		const result = await lookupBarcode('7038010072291')
		expect(result.found).toBe(true)
		if (!result.found) return

		expect(result.product.name).toBe('TINE - Iskaffe Protein Latte')
		expect(result.product.servingSize).toBe(330)
		expect(result.product.servingUnit).toBe('ml')
	})

	it('stores per-100g at label precision, not the float OFF derived it as', async () => {
		// 296 kcal / 430 g tub — OFF hands back 68.8372093023256, which the ingredient row keeps
		mockOFF({
			product_name: 'Yt Proteinyoghurt',
			serving_quantity: 430,
			nutriments: { proteins_100g: 9.30232558139535, 'energy-kcal_100g': 68.8372093023256 }
		})

		const result = await lookupBarcode('7038010068997')
		if (!result.found) throw new Error('expected found')

		expect(result.product.per100g.protein).toBe(9.3)
		expect(result.product.per100g.kcal).toBe(69)
	})

	it('leaves servingSize null when OFF declares none, so callers can tell 100g-by-default apart', async () => {
		mockOFF({ product_name: 'x', nutriments: { proteins_100g: 25 } })

		const result = await lookupBarcode('12345678')
		if (!result.found) throw new Error('expected found')

		expect(result.product.servingSize).toBeNull()
		// Absent a serving, the per-serving figures describe 100 g
		expect(result.product.perServing.protein).toBe(25)
	})

	it('keeps per-serving macros at full precision so the divide-back to per-100g is lossless', async () => {
		// A 10 g serving multiplies any rounding here 10x on the way back to per-100g
		mockOFF({ product_name: 'x', serving_quantity: 10, nutriments: { fat_100g: 63.7 } })

		const result = await lookupBarcode('12345678')
		if (!result.found) throw new Error('expected found')

		const perServing = result.product.perServing.fat
		expect(perServing).toBeCloseTo(6.37, 10)
		expect((perServing / 10) * 100).toBeCloseTo(63.7, 10)
	})

	it('derives servings from the package size', async () => {
		mockOFF({ product_name: 'x', serving_quantity: 30, product_quantity: 150, nutriments: {} })

		const result = await lookupBarcode('12345678')
		if (!result.found) throw new Error('expected found')

		expect(result.product.servings).toBe(5)
		expect(result.product.packageSize).toBe(150)
	})
})

describe('offUnits', () => {
	it('offers the serving as pcs and the package as pkg', () => {
		expect(offUnits(product({ servingSize: 30, packageSize: 150 }))).toEqual([
			{ name: 'pcs', grams: 30 },
			{ name: 'pkg', grams: 150 }
		])
	})

	it('drops pkg when the package is a single serving, to avoid two names for one weight', () => {
		expect(offUnits(product({ servingSize: 330, packageSize: 330 }))).toEqual([{ name: 'pcs', grams: 330 }])
	})

	it('offers nothing when OFF has neither', () => {
		expect(offUnits(product())).toEqual([])
	})
})
