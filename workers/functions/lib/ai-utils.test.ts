import { describe, expect, it } from 'vitest'
import { scoreUsdaMatch } from './ai-utils'

/** Helper: given a query and list of descriptions, return the best match */
function bestMatch(query: string, descriptions: string[]): string {
	return descriptions.reduce((best, candidate) =>
		scoreUsdaMatch(query, candidate) > scoreUsdaMatch(query, best) ? candidate : best
	)
}

describe('scoreUsdaMatch', () => {
	it('prefers exact first-word match over loose mention', () => {
		expect(bestMatch('milk', ['Crackers, milk', 'Milk, whole'])).toBe('Milk, whole')
	})

	it('picks the shortest match when scores are close', () => {
		expect(bestMatch('milk', ['Milk, whole', 'Milk, whole, 3.25% milkfat'])).toBe('Milk, whole')
	})

	it('prefers exact match for multi-word queries', () => {
		expect(
			bestMatch('chicken breast', [
				'Chicken breast',
				'Chicken breast, raw',
				'Chicken, whole',
				'Chicken breast, cooked, roasted',
				'Turkey breast'
			])
		).toBe('Chicken breast')
	})

	it('handles USDA reversed naming (Oil, olive)', () => {
		expect(bestMatch('olive oil', ['Oil, olive', 'Oil, coconut', 'Olives, ripe', 'Oil, olive, extra virgin'])).toBe(
			'Oil, olive'
		)
	})

	it('scores zero when no query words match', () => {
		expect(scoreUsdaMatch('banana', 'Crackers, milk')).toBe(0)
	})

	it('prefers "Milk, NFS" over "Milk, human" for generic milk query', () => {
		const nfs = scoreUsdaMatch('milk', 'Milk, NFS')
		const human = scoreUsdaMatch('milk', 'Milk, human')
		expect(nfs).toBeGreaterThan(human)
	})

	it('prefers shorter descriptions with same match count', () => {
		expect(bestMatch('rice', ['Rice, white, long-grain, regular, raw', 'Rice, brown, long-grain, raw'])).toBe(
			'Rice, brown, long-grain, raw'
		)
	})

	it('handles case insensitivity', () => {
		expect(scoreUsdaMatch('MILK', 'Milk, whole')).toBe(scoreUsdaMatch('milk', 'Milk, whole'))
	})
})
