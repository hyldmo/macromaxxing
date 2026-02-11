// Pure preparation descriptors — safe to strip (never product names)
export const PREP_DESCRIPTORS = [
	// Cutting
	'chopped',
	'minced',
	'diced',
	'sliced',
	'julienned',
	'cubed',
	'cut',
	'shredded',
	'grated',
	'torn',
	'halved',
	'quartered',
	'beaten',
	'crushed',
	// Prep
	'peeled',
	'trimmed',
	'pitted',
	'seeded',
	'deseeded',
	'cored',
	'deboned',
	'deveined',
	'shelled',
	'hulled',
	// State
	'melted',
	'softened',
	'chilled',
	'cooled',
	'thawed',
	// Measurement
	'divided',
	'sifted',
	'packed',
	'heaping',
	'level',
	'rounded'
] as const

export type PrepDescriptor = (typeof PREP_DESCRIPTORS)[number]
// Only stripped when followed by a descriptor
export const PREP_ADVERBS = ['finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'freshly', 'lightly'] as const
export type PrepAdverb = (typeof PREP_ADVERBS)[number]

// Food modifiers that don't constitute a standalone ingredient name — prevent middle-pattern
// from splitting "Canned Diced Tomatoes" into name:"Canned" + prep:"diced tomatoes"
const FOOD_MODIFIERS = [
	'canned', 'frozen', 'fresh', 'dried', 'organic', 'raw', 'cooked',
	'smoked', 'pickled', 'roasted', 'toasted', 'blanched', 'marinated',
	'seasoned', 'unsalted', 'salted', 'whole', 'boneless', 'skinless',
]

// Serving instructions stripped before parsing: ", to serve", ", for garnish"
const SERVING_SUFFIXES = [', to serve', ', for serving', ', to garnish', ', for garnish']

/**
 * Extract preparation descriptor from an ingredient name.
 *
 * "Garlic Cloves, Minced" → { name: "Garlic Cloves", preparation: "minced" }
 * "Finely Chopped Onion" → { name: "Onion", preparation: "finely chopped" }
 * "Ground Beef" → { name: "Ground Beef", preparation: null }
 */
export function extractPreparation(input: string): { name: string; preparation: string | null } {
	let trimmed = input.trim()
	if (!trimmed) return { name: trimmed, preparation: null }

	// 0. Strip serving suffixes: "Spring Onions Sliced, To Serve" → "Spring Onions Sliced"
	const lower = trimmed.toLowerCase()
	for (const suffix of SERVING_SUFFIXES) {
		if (lower.endsWith(suffix)) {
			trimmed = trimmed.slice(0, -suffix.length).trim()
			break
		}
	}

	// 1. Trailing comma pattern: "Garlic Cloves, Minced" or "Onion, Finely Chopped"
	const commaIdx = trimmed.indexOf(',')
	if (commaIdx > 0) {
		const after = trimmed
			.slice(commaIdx + 1)
			.trim()
			.toLowerCase()
		const words = after.split(/\s+/)
		const firstWord = words[0]

		if (
			PREP_DESCRIPTORS.includes(firstWord as PrepDescriptor) ||
			(PREP_ADVERBS.includes(firstWord as PrepAdverb) &&
				words.length > 1 &&
				PREP_DESCRIPTORS.includes(words[1] as PrepDescriptor))
		) {
			return { name: trimmed.slice(0, commaIdx).trim(), preparation: after }
		}
	}

	// 2. Leading pattern: "Finely Chopped Onion" or "Minced Garlic"
	const words = trimmed.split(/\s+/)
	let stripCount = 0

	for (let i = 0; i < words.length - 1; i++) {
		const word = words[i].toLowerCase()
		if (PREP_ADVERBS.includes(word as PrepAdverb)) {
			// Adverb must be followed by a descriptor
			if (i + 1 < words.length - 1 && PREP_DESCRIPTORS.includes(words[i + 1].toLowerCase() as PrepDescriptor)) {
				stripCount = i + 2
				i++ // skip the descriptor too
			} else {
				break
			}
		} else if (PREP_DESCRIPTORS.includes(word as PrepDescriptor)) {
			stripCount = i + 1
		} else {
			break
		}
	}

	if (stripCount > 0 && stripCount < words.length) {
		const preparation = words.slice(0, stripCount).join(' ').toLowerCase()
		const name = words.slice(stripCount).join(' ')
		return { name, preparation }
	}

	// 3. Trailing pattern (no comma): "Red Onion Finely Chopped", "Garlic Clove Crushed"
	let trailStart = words.length
	for (let i = words.length - 1; i > 0; i--) {
		const word = words[i].toLowerCase()
		if (PREP_DESCRIPTORS.includes(word as PrepDescriptor)) {
			trailStart = i
		} else if (PREP_ADVERBS.includes(word as PrepAdverb) && trailStart === i + 1) {
			trailStart = i
		} else {
			break
		}
	}

	if (trailStart > 0 && trailStart < words.length) {
		const preparation = words.slice(trailStart).join(' ').toLowerCase()
		const name = words.slice(0, trailStart).join(' ')
		return { name, preparation }
	}

	// 4. Middle pattern: "Spring Onions Sliced On The Diagonal", "Sweet Potatoes Cut Into Chunks"
	// First descriptor (or adverb+descriptor) splits into name + preparation,
	// but only if the name portion contains a real ingredient word (not just food modifiers)
	for (let i = 1; i < words.length; i++) {
		const word = words[i].toLowerCase()
		if (
			PREP_DESCRIPTORS.includes(word as PrepDescriptor) ||
			(PREP_ADVERBS.includes(word as PrepAdverb) &&
				i + 1 < words.length &&
				PREP_DESCRIPTORS.includes(words[i + 1].toLowerCase() as PrepDescriptor))
		) {
			const namePart = words.slice(0, i)
			if (namePart.some(w => !FOOD_MODIFIERS.includes(w.toLowerCase()))) {
				return {
					name: namePart.join(' '),
					preparation: words.slice(i).join(' ').toLowerCase(),
				}
			}
		}
	}

	return { name: trimmed, preparation: null }
}
