import type { IngredientSource } from './custom-types'

interface SourceMeta {
	label: string
	externalUrl: (sourceId: string) => string
}

/** Sources that carry a re-queryable external record. manual/ai/label have no entry. */
const SOURCE_REGISTRY: Partial<Record<IngredientSource, SourceMeta>> = {
	usda: {
		label: 'USDA',
		externalUrl: id => `https://fdc.nal.usda.gov/food-details/${id}`
	},
	openfoodfacts: {
		label: 'Open Food Facts',
		externalUrl: id => `https://world.openfoodfacts.org/product/${id}`
	}
}

/** Resolve the external product/record URL for an ingredient, or null when none applies. */
export function getSourceUrl(source: IngredientSource, sourceId: string | null): string | null {
	if (!sourceId) return null
	return SOURCE_REGISTRY[source]?.externalUrl(sourceId) ?? null
}
