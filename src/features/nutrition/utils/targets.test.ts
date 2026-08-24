import { describe, expect, it } from 'vitest'
import { MACRO_TARGET_KIND, targetDelta, targetStatus } from './targets'

describe('MACRO_TARGET_KIND', () => {
	it('makes calories the only budget', () => {
		expect(MACRO_TARGET_KIND.kcal).toBe('budget')
		expect(MACRO_TARGET_KIND.protein).toBe('floor')
		expect(MACRO_TARGET_KIND.carbs).toBe('floor')
		expect(MACRO_TARGET_KIND.fat).toBe('floor')
		expect(MACRO_TARGET_KIND.fiber).toBe('floor')
	})
})

describe('targetStatus', () => {
	it('reads a non-positive target as satisfied — nothing required cannot be missed', () => {
		expect(targetStatus(100, 0)).toBe('on')
		expect(targetStatus(100, -50)).toBe('on')
		expect(targetStatus(0, 0, 'floor')).toBe('on')
	})

	it('holds the ±5% band for a budget', () => {
		expect(targetStatus(95, 100)).toBe('on')
		expect(targetStatus(105, 100)).toBe('on')
		expect(targetStatus(94.99, 100)).toBe('under')
		expect(targetStatus(105.01, 100)).toBe('over')
	})

	it('never reports a floor as over, however far past it', () => {
		expect(targetStatus(105.01, 100, 'floor')).toBe('on')
		expect(targetStatus(1000, 100, 'floor')).toBe('on')
	})

	it('still reports a floor that was missed', () => {
		expect(targetStatus(94.99, 100, 'floor')).toBe('under')
		expect(targetStatus(95, 100, 'floor')).toBe('on')
	})
})

describe('targetDelta', () => {
	it('says nothing when the difference rounds away', () => {
		expect(targetDelta(100, 100)).toBe('')
		expect(targetDelta(100.4, 100)).toBe('')
	})

	it('signs the difference against a budget', () => {
		expect(targetDelta(112, 100)).toBe('+12')
		expect(targetDelta(88, 100)).toBe('-12')
	})

	it('shows the shortfall on a floor and stays quiet once it is cleared', () => {
		expect(targetDelta(88, 100, 'floor')).toBe('-12')
		expect(targetDelta(112, 100, 'floor')).toBe('')
	})
})
