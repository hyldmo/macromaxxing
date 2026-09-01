import { type AbsoluteMacros, roundMacrosPer100g } from '@macromaxxing/db'

type MacroSet = Omit<AbsoluteMacros, 'weight'>

export interface OFFProduct {
	name: string
	brand: string | null
	/** OFF `serving_quantity`, null when the record declares no serving (do NOT silently read as 100) */
	servingSize: number | null
	/** Unit OFF recorded the serving in — 'ml' for drinks, so serving size is a volume, not a mass */
	servingUnit: string | null
	servings: number | null
	/** Net package weight in grams (product_quantity), null when OFF has no value */
	packageSize: number | null
	/**
	 * Macros for one serving, or for 100 g when OFF declares none. Full precision on purpose:
	 * callers divide back out by `servingSize` to store per-100g, and pre-rounding here would
	 * bake the rounding error in at 100/servingSize × its size (0.5 g/100 g on a 10 g serving).
	 */
	perServing: MacroSet
	/** At label precision — OFF derives this by division when a record only declares a serving */
	per100g: MacroSet
	barcode: string
}

type OFFLookupResult = { found: true; product: OFFProduct } | { found: false; barcode: string }

/**
 * The countable units an OFF record implies: one serving ('pcs') and the whole package ('pkg'),
 * so a scanned item can be logged as "1" instead of the user weighing out its grams.
 */
export function offUnits(product: OFFProduct): { name: string; grams: number }[] {
	const units: { name: string; grams: number }[] = []
	if (product.servingSize) units.push({ name: 'pcs', grams: product.servingSize })
	// A single-serving package would make 'pkg' a duplicate of 'pcs'
	if (product.packageSize && product.packageSize !== product.servingSize)
		units.push({ name: 'pkg', grams: product.packageSize })
	return units
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function isValidBarcode(value: string): boolean {
	return /^\d{8,13}$/.test(value.trim())
}

export async function lookupBarcode(barcode: string): Promise<OFFLookupResult> {
	const fields = 'product_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity'
	const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`, {
		headers: { 'User-Agent': 'Macromaxxing/1.0 (https://github.com/hyldmo/macromaxxing)' }
	})

	if (!res.ok) throw new Error(`Open Food Facts request failed (${res.status})`)

	interface OFFResponse {
		status: number
		product?: {
			product_name?: string
			brands?: string
			nutriments?: Record<string, number>
			serving_size?: string
			serving_quantity?: number
			serving_quantity_unit?: string
			product_quantity?: number
		}
	}

	const data: OFFResponse = await res.json()
	if (data.status !== 1 || !data.product) return { found: false, barcode }

	const p = data.product
	const n = p.nutriments ?? {}

	// OFF computes its per-100 g column from the serving when the record only declares one,
	// so a 430 g tub of 296 kcal comes back as 68.8372093023256. That is the number ingredients
	// are STORED with, so cut it to what the packet prints before it leaves this function.
	const raw: MacroSet = {
		protein: Number(n.proteins_100g) || 0,
		carbs: Number(n.carbohydrates_100g) || 0,
		fat: Number(n.fat_100g) || 0,
		kcal: Number(n['energy-kcal_100g']) || 0,
		fiber: Number(n.fiber_100g) || 0
	}
	const per100g = roundMacrosPer100g(raw)

	const servingQty = Number(p.serving_quantity) || 0
	const servingSize = servingQty > 0 ? round1(servingQty) : null
	const factor = (servingSize ?? 100) / 100

	const productQty = Number(p.product_quantity) || 0
	const servings = servingQty > 0 && productQty > 0 ? Math.round(productQty / servingQty) : null

	const name = p.product_name || 'Unknown product'
	const brand = p.brands?.trim() || null

	return {
		found: true,
		product: {
			name: brand ? `${brand} - ${name}` : name,
			brand,
			servingSize,
			servingUnit: p.serving_quantity_unit?.trim() || null,
			servings,
			packageSize: productQty > 0 ? round1(productQty) : null,
			// Off the raw column, not the rounded one: a 10 g serving multiplies any rounding
			// here 10x on the way back to per-100g
			perServing: {
				protein: raw.protein * factor,
				carbs: raw.carbs * factor,
				fat: raw.fat * factor,
				kcal: raw.kcal * factor,
				fiber: raw.fiber * factor
			},
			per100g,
			barcode
		}
	}
}
