import { describe, expect, it } from 'vitest'
import { formatTickDate, linearScale, pickTickIndices } from './scale'

describe('linearScale', () => {
	it('maps the input range to the output range linearly', () => {
		expect(linearScale(50, 0, 100, 0, 1000)).toBe(500)
		expect(linearScale(25, 0, 100, 0, 1000)).toBe(250)
	})

	it('returns outMin when value === min', () => {
		expect(linearScale(10, 10, 20, 0, 100)).toBe(0)
	})

	it('returns outMax when value === max', () => {
		expect(linearScale(20, 10, 20, 0, 100)).toBe(100)
	})

	it('returns the midpoint of the output range when min === max (single-value safe)', () => {
		expect(linearScale(42, 42, 42, 0, 360)).toBe(180)
		expect(linearScale(0, 0, 0, 100, 200)).toBe(150)
	})

	it('handles inverted output ranges (e.g. SVG y-axis where 0 is at the top)', () => {
		// Common case: chart uses outMax < outMin to flip the y-axis for SVG.
		expect(linearScale(0, 0, 100, 360, 0)).toBe(360)
		expect(linearScale(100, 0, 100, 360, 0)).toBe(0)
		expect(linearScale(50, 0, 100, 360, 0)).toBe(180)
	})
})

describe('pickTickIndices', () => {
	it('returns every index when n <= maxLabels', () => {
		expect(pickTickIndices(0)).toEqual([])
		expect(pickTickIndices(1)).toEqual([0])
		expect(pickTickIndices(6)).toEqual([0, 1, 2, 3, 4, 5])
	})

	it('returns evenly spaced indices including first and last when n > maxLabels', () => {
		const result = pickTickIndices(11, 6)
		expect(result[0]).toBe(0)
		expect(result.at(-1)).toBe(10)
		expect(result.length).toBeLessThanOrEqual(6)
	})

	it('respects custom maxLabels', () => {
		expect(pickTickIndices(100, 3)).toEqual([0, 50, 99])
	})

	it('deduplicates and stays sorted', () => {
		const result = pickTickIndices(7, 6)
		const sorted = [...result].sort((a, b) => a - b)
		expect(result).toEqual(sorted)
		expect(new Set(result).size).toBe(result.length)
	})
})

describe('formatTickDate', () => {
	it('returns empty string when there are no timestamps', () => {
		expect(formatTickDate(0, [])).toBe('')
	})

	it('uses HH:mm when all timestamps are on the same day', () => {
		// 2024-03-12 09:00 and 14:30 UTC — same day in any reasonable TZ for the test
		const morning = new Date(2024, 2, 12, 9, 0).getTime()
		const afternoon = new Date(2024, 2, 12, 14, 30).getTime()
		const result = formatTickDate(afternoon, [morning, afternoon])
		// Should look like "14:30" — assert digits + colon, no month name
		expect(result).toMatch(/^\d{2}:\d{2}$/)
	})

	it('uses month + day when timestamps span the same year', () => {
		const a = new Date(2024, 2, 12).getTime()
		const b = new Date(2024, 8, 1).getTime()
		const result = formatTickDate(a, [a, b])
		// Contains a month abbreviation (3 letters) and a day number
		expect(result).toMatch(/[A-Za-z]{3,}/)
		expect(result).not.toMatch(/'\d{2}/)
	})

	it('appends a 2-digit year when timestamps span multiple years', () => {
		const a = new Date(2023, 2, 12).getTime()
		const b = new Date(2024, 2, 12).getTime()
		const result = formatTickDate(b, [a, b])
		expect(result).toMatch(/'24$/)
	})
})
