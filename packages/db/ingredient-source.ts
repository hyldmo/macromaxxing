import { type IngredientSource, ingredientSource } from './custom-types'

/**
 * The sources a caller may assign directly. `label` is excluded because it doubles as a visibility
 * flag: `ingredient.list` hides `label` rows since they're the backing ingredient of a `type: 'premade'`
 * recipe and would otherwise duplicate it. `recipe.addPremade` inserts those itself, so no legitimate
 * create/update carries it — but an agent transcribing a nutrition label reads the word and reaches for
 * it, and the row it made would be invisible to every list surface with no error to explain why.
 */
export const authoredIngredientSource = ingredientSource.exclude(['label'], {
	error: "source 'label' is reserved for the backing ingredient of a premade product — use recipe.addPremade, which creates both the ingredient and its premade recipe."
})

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
