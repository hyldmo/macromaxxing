import { describe, expect, it } from 'vitest'
import { targetDelta, targetStatus } from './targets'

describe('targetStatus', () => {
	it('treats a non-positive target as never reached', () => {
		expect(targetStatus(100, 0)).toBe('under')
		expect(targetStatus(100, -50)).toBe('under')
	})

	it('holds the ±5% band', () => {
		expect(targetStatus(95, 100)).toBe('on')
		expect(targetStatus(105, 100)).toBe('on')
		expect(targetStatus(94.99, 100)).toBe('under')
		expect(targetStatus(105.01, 100)).toBe('over')
	})
})

describe('targetDelta', () => {
	it('says nothing when the difference rounds away', () => {
		expect(targetDelta(100, 100)).toBe('')
		expect(targetDelta(100.4, 100)).toBe('')
	})

	it('signs the difference', () => {
		expect(targetDelta(112, 100)).toBe('+12')
		expect(targetDelta(88, 100)).toBe('-12')
	})
})
