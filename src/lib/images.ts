import type { Recipe } from '@macromaxxing/db'

export const R2_BASE_URL = import.meta.env.VITE_R2_BASE_URL ?? ''

type RecipeImage = NonNullable<Recipe['image']>

/** Resolve a recipe image value to a renderable URL */
export const getImageUrl = (image: RecipeImage): string =>
	image.startsWith('http') ? image : `${R2_BASE_URL}/recipes/${image}`

/** Check if an image is externally hosted (for attribution) */
export const isExternalImage = (image: string): image is `http${string}` => image.startsWith('http')

/** Extract hostname for attribution display */
export const getImageAttribution = (url: string): string => new URL(url).hostname.replace(/^www\./, '')
