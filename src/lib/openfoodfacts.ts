export interface OFFProduct {
	name: string
	brand: string | null
	servingSize: number
	servings: number | null
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
	per100g: {
		protein: number
		carbs: number
		fat: number
		kcal: number
		fiber: number
	}
	barcode: string
}

type OFFLookupResult = { found: true; product: OFFProduct } | { found: false; barcode: string }

const round1 = (n: number) => Math.round(n * 10) / 10

export function isValidBarcode(value: string): boolean {
	return /^\d{8,13}$/.test(value.trim())
}

export async function lookupBarcode(barcode: string): Promise<OFFLookupResult> {
	const fields = 'product_name,brands,nutriments,serving_size,serving_quantity,product_quantity'
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
			product_quantity?: number
		}
	}

	const data: OFFResponse = await res.json()
	if (data.status !== 1 || !data.product) return { found: false, barcode }

	const p = data.product
	const n = p.nutriments ?? {}

	const per100 = {
		protein: Number(n.proteins_100g) || 0,
		carbs: Number(n.carbohydrates_100g) || 0,
		fat: Number(n.fat_100g) || 0,
		kcal: Number(n['energy-kcal_100g']) || 0,
		fiber: Number(n.fiber_100g) || 0
	}

	const servingQty = Number(p.serving_quantity) || 0
	const servingSize = servingQty > 0 ? servingQty : 100
	const factor = servingSize / 100

	const productQty = Number(p.product_quantity) || 0
	const servings = servingQty > 0 && productQty > 0 ? Math.round(productQty / servingQty) : null

	const name = p.product_name || 'Unknown product'
	const brand = p.brands?.trim() || null

	return {
		found: true,
		product: {
			name: brand ? `${brand} - ${name}` : name,
			brand,
			servingSize: round1(servingSize),
			servings,
			protein: round1(per100.protein * factor),
			carbs: round1(per100.carbs * factor),
			fat: round1(per100.fat * factor),
			kcal: round1(per100.kcal * factor),
			fiber: round1(per100.fiber * factor),
			per100g: {
				protein: round1(per100.protein),
				carbs: round1(per100.carbs),
				fat: round1(per100.fat),
				kcal: round1(per100.kcal),
				fiber: round1(per100.fiber)
			},
			barcode
		}
	}
}
