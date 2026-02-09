// Pure preparation descriptors — safe to strip (never product names)
export const PREP_DESCRIPTORS = new Set([
	// Cutting
	'chopped',
	'minced',
	'diced',
	'sliced',
	'julienned',
	'cubed',
	'shredded',
	'grated',
	'torn',
	'halved',
	'quartered',
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
])

// Only stripped when followed by a descriptor
export const PREP_ADVERBS = new Set(['finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'freshly', 'lightly'])

/**
 * Extract preparation descriptor from an ingredient name.
 *
 * "Garlic Cloves, Minced" → { name: "Garlic Cloves", preparation: "minced" }
 * "Finely Chopped Onion" → { name: "Onion", preparation: "finely chopped" }
 * "Ground Beef" → { name: "Ground Beef", preparation: null }
 */
export function extractPreparation(input: string): { name: string; preparation: string | null } {
	const trimmed = input.trim()
	if (!trimmed) return { name: trimmed, preparation: null }

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
			PREP_DESCRIPTORS.has(firstWord) ||
			(PREP_ADVERBS.has(firstWord) && words.length > 1 && PREP_DESCRIPTORS.has(words[1]))
		) {
			return { name: trimmed.slice(0, commaIdx).trim(), preparation: after }
		}
	}

	// 2. Leading pattern: "Finely Chopped Onion" or "Minced Garlic"
	const words = trimmed.split(/\s+/)
	let stripCount = 0

	for (let i = 0; i < words.length - 1; i++) {
		const word = words[i].toLowerCase()
		if (PREP_ADVERBS.has(word)) {
			// Adverb must be followed by a descriptor
			if (i + 1 < words.length - 1 && PREP_DESCRIPTORS.has(words[i + 1].toLowerCase())) {
				stripCount = i + 2
				i++ // skip the descriptor too
			} else {
				break
			}
		} else if (PREP_DESCRIPTORS.has(word)) {
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

	return { name: trimmed, preparation: null }
}
