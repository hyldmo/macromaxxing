import { describe, expect, it } from 'vitest'
import { DEFAULT_FAVORITES, FAVORITABLE_ROUTES, nextFavorites, parseStoredFavorites } from './useBottomNavFavorites'

const KNOWN = FAVORITABLE_ROUTES

describe('parseStoredFavorites', () => {
	it('returns DEFAULT_FAVORITES when input is null', () => {
		expect(parseStoredFavorites(null)).toEqual(DEFAULT_FAVORITES)
	})

	it('returns DEFAULT_FAVORITES when JSON is malformed', () => {
		expect(parseStoredFavorites('not json{')).toEqual(DEFAULT_FAVORITES)
	})

	it('returns DEFAULT_FAVORITES when value is not an array', () => {
		expect(parseStoredFavorites('{"a":1}')).toEqual(DEFAULT_FAVORITES)
	})

	it('filters out unknown routes', () => {
		expect(parseStoredFavorites(JSON.stringify(['/recipes', '/nope', '/plans']))).toEqual(['/recipes', '/plans'])
	})

	it('preserves order and dedupes', () => {
		expect(parseStoredFavorites(JSON.stringify(['/plans', '/recipes', '/plans']))).toEqual(['/plans', '/recipes'])
	})

	it('caps at 4 entries (drops trailing extras)', () => {
		const all = KNOWN.map(r => r.to)
		expect(parseStoredFavorites(JSON.stringify(all))).toEqual(all.slice(0, 4))
	})
})

describe('nextFavorites', () => {
	it('adds a new favorite at the end', () => {
		expect(nextFavorites(['/recipes', '/plans'], '/workouts')).toEqual(['/recipes', '/plans', '/workouts'])
	})

	it('removes a favorite that is already present', () => {
		expect(nextFavorites(['/recipes', '/plans', '/workouts'], '/plans')).toEqual(['/recipes', '/workouts'])
	})

	it('drops oldest when adding a 5th', () => {
		const current = ['/recipes', '/ingredients', '/plans', '/workouts']
		expect(nextFavorites(current, '/analytics')).toEqual(['/ingredients', '/plans', '/workouts', '/analytics'])
	})

	it('ignores routes that are not favoritable', () => {
		const current = ['/recipes']
		expect(nextFavorites(current, '/not-a-route')).toEqual(['/recipes'])
	})
})
