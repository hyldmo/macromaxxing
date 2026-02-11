import { describe, expect, it } from 'vitest'
import { extractPreparation } from './preparation'

describe('extractPreparation', () => {
	describe('trailing comma pattern', () => {
		it('extracts single descriptor after comma', () => {
			expect(extractPreparation('Garlic Cloves, Minced')).toEqual({
				name: 'Garlic Cloves',
				preparation: 'minced'
			})
		})

		it('extracts adverb + descriptor after comma', () => {
			expect(extractPreparation('Onion, Finely Chopped')).toEqual({
				name: 'Onion',
				preparation: 'finely chopped'
			})
		})

		it('extracts "cut into" phrase after comma', () => {
			expect(extractPreparation('Sweet Potatoes, Cut Into Even Chunks')).toEqual({
				name: 'Sweet Potatoes',
				preparation: 'cut into even chunks'
			})
		})

		it('handles extra space before comma', () => {
			expect(extractPreparation('Sweet Potatoes , Cut Into Even Chunks')).toEqual({
				name: 'Sweet Potatoes',
				preparation: 'cut into even chunks'
			})
		})
	})

	describe('leading pattern', () => {
		it('extracts leading descriptor', () => {
			expect(extractPreparation('Minced Garlic')).toEqual({
				name: 'Garlic',
				preparation: 'minced'
			})
		})

		it('extracts leading adverb + descriptor', () => {
			expect(extractPreparation('Finely Chopped Onion')).toEqual({
				name: 'Onion',
				preparation: 'finely chopped'
			})
		})

		it('does not strip leading descriptor if it would consume entire string', () => {
			expect(extractPreparation('Crushed')).toEqual({
				name: 'Crushed',
				preparation: null
			})
		})
	})

	describe('trailing pattern (no comma)', () => {
		it('extracts trailing descriptor', () => {
			expect(extractPreparation('Garlic Clove Crushed')).toEqual({
				name: 'Garlic Clove',
				preparation: 'crushed'
			})
		})

		it('extracts trailing adverb + descriptor', () => {
			expect(extractPreparation('Red Onion Finely Chopped')).toEqual({
				name: 'Red Onion',
				preparation: 'finely chopped'
			})
		})

		it('extracts trailing descriptor from multi-word name', () => {
			expect(extractPreparation('Red Chilli Finely Chopped')).toEqual({
				name: 'Red Chilli',
				preparation: 'finely chopped'
			})
		})

		it('extracts multiple trailing descriptors', () => {
			expect(extractPreparation('Carrots Peeled Sliced')).toEqual({
				name: 'Carrots',
				preparation: 'peeled sliced'
			})
		})
	})

	describe('middle pattern with qualifier', () => {
		it('extracts descriptor + qualifier phrase', () => {
			expect(extractPreparation('Spring Onions Sliced On The Diagonal')).toEqual({
				name: 'Spring Onions',
				preparation: 'sliced on the diagonal'
			})
		})

		it('extracts "cut into" in middle position', () => {
			expect(extractPreparation('Sweet Potatoes Cut Into Chunks')).toEqual({
				name: 'Sweet Potatoes',
				preparation: 'cut into chunks'
			})
		})

		it('does not split when name would be only food modifiers', () => {
			expect(extractPreparation('Canned Diced Tomatoes')).toEqual({
				name: 'Canned Diced Tomatoes',
				preparation: null
			})
		})

		it('splits when name has real ingredient word before descriptor', () => {
			expect(extractPreparation('Chicken Breast Sliced Into Strips')).toEqual({
				name: 'Chicken Breast',
				preparation: 'sliced into strips'
			})
		})
	})

	describe('serving suffix stripping', () => {
		it('strips ", to serve" and extracts preparation', () => {
			expect(extractPreparation('Spring Onions Sliced On The Diagonal, To Serve')).toEqual({
				name: 'Spring Onions',
				preparation: 'sliced on the diagonal'
			})
		})

		it('strips ", for garnish"', () => {
			expect(extractPreparation('Parsley Chopped, For Garnish')).toEqual({
				name: 'Parsley',
				preparation: 'chopped'
			})
		})
	})

	describe('no preparation', () => {
		it('returns null for plain ingredient names', () => {
			expect(extractPreparation('Chicken Thigh')).toEqual({
				name: 'Chicken Thigh',
				preparation: null
			})
		})

		it('returns null for names without prep words', () => {
			expect(extractPreparation('Red Split Lentils')).toEqual({
				name: 'Red Split Lentils',
				preparation: null
			})
		})

		it('returns null for simple names', () => {
			expect(extractPreparation('Sesame Oil')).toEqual({
				name: 'Sesame Oil',
				preparation: null
			})
		})

		it('handles empty string', () => {
			expect(extractPreparation('')).toEqual({
				name: '',
				preparation: null
			})
		})

		it('handles whitespace-only string', () => {
			expect(extractPreparation('   ')).toEqual({
				name: '',
				preparation: null
			})
		})
	})
})
