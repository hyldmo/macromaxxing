import { describe, expect, it } from 'vitest'
import { formatRecency } from './date'

describe('formatRecency', () => {
	const HOUR = 3_600_000
	const DAY = 86_400_000
	const WEEK = 7 * DAY

	it('returns "today" for sub-day deltas', () => {
		expect(formatRecency(0)).toBe('today')
		expect(formatRecency(HOUR)).toBe('today')
		expect(formatRecency(DAY - 1)).toBe('today')
	})

	it('returns "today" for negative deltas (future timestamps / clock skew)', () => {
		expect(formatRecency(-HOUR)).toBe('today')
	})

	it('returns "today" for non-finite input', () => {
		expect(formatRecency(Number.NaN)).toBe('today')
		expect(formatRecency(Number.POSITIVE_INFINITY)).toBe('today')
	})

	it('formats whole-day deltas under 14 days', () => {
		expect(formatRecency(DAY)).toBe('1d ago')
		expect(formatRecency(5 * DAY)).toBe('5d ago')
		expect(formatRecency(13 * DAY)).toBe('13d ago')
	})

	it('switches to weeks at 14 days', () => {
		expect(formatRecency(14 * DAY)).toBe('2w ago')
		expect(formatRecency(3 * WEEK)).toBe('3w ago')
		expect(formatRecency(7 * WEEK + DAY)).toBe('7w ago')
	})

	it('switches to months at 8 weeks', () => {
		// 8 weeks = 56 days → 56/30 = 1mo (still < 8w threshold via days/7=8)
		expect(formatRecency(8 * WEEK)).toBe('1mo ago')
		expect(formatRecency(90 * DAY)).toBe('3mo ago')
		expect(formatRecency(364 * DAY)).toBe('12mo ago')
	})

	it('switches to years at 365 days', () => {
		expect(formatRecency(365 * DAY)).toBe('1y ago')
		expect(formatRecency(2 * 365 * DAY)).toBe('2y ago')
	})
})
