import { describe, expect, it } from 'vitest'
import { mealPlanLabel } from './mealPlans'

describe('mealPlanLabel', () => {
	it('prefers the name when one is set', () => {
		expect(mealPlanLabel({ name: 'Cutting Week', weekStart: '2026-08-03' })).toBe('Cutting Week')
		expect(mealPlanLabel({ name: 'Prep Template', weekStart: null })).toBe('Prep Template')
	})

	it('falls back to the ISO week of an unnamed dated plan', () => {
		// 2026-08-03 is a Monday in ISO week 32.
		expect(mealPlanLabel({ name: null, weekStart: '2026-08-03' })).toBe('Week 32')
		expect(mealPlanLabel({ name: null, weekStart: '2026-01-05' })).toBe('Week 2')
	})

	it('never renders an empty name as the label', () => {
		expect(mealPlanLabel({ name: '', weekStart: '2026-08-03' })).toBe('Week 32')
	})

	it('names an unnamed template, which has no week to borrow', () => {
		expect(mealPlanLabel({ name: null, weekStart: null })).toBe('Untitled template')
	})
})
