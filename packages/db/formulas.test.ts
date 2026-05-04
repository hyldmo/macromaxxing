import { describe, expect, it } from 'vitest'
import { utcDateKey, WINDOW_CUTOFF_MS, windowSinceMs } from './formulas'

const DAY_MS = 24 * 60 * 60 * 1000

describe('WINDOW_CUTOFF_MS', () => {
	it('4w = 28 days in ms', () => {
		expect(WINDOW_CUTOFF_MS['4w']).toBe(28 * DAY_MS)
	})

	it('12w = 84 days in ms', () => {
		expect(WINDOW_CUTOFF_MS['12w']).toBe(84 * DAY_MS)
	})

	it('1y = 365 days in ms (no leap-year adjustment)', () => {
		expect(WINDOW_CUTOFF_MS['1y']).toBe(365 * DAY_MS)
	})
})

describe('windowSinceMs', () => {
	const NOW = 1_700_000_000_000 // 2023-11-14T22:13:20.000Z, arbitrary fixed reference

	it('subtracts the cutoff from the provided `now`', () => {
		expect(windowSinceMs('4w', NOW)).toBe(NOW - 28 * DAY_MS)
		expect(windowSinceMs('12w', NOW)).toBe(NOW - 84 * DAY_MS)
		expect(windowSinceMs('1y', NOW)).toBe(NOW - 365 * DAY_MS)
	})

	it('cutoff defines a half-open window [now - cutoff, now): a session AT the cutoff is in-window', () => {
		const since = windowSinceMs('4w', NOW)
		// The boundary timestamp itself is included (>= since).
		expect(since).toBeLessThanOrEqual(since)
		expect(NOW - 28 * DAY_MS).toBe(since)
	})

	it('a session 1ms before the cutoff is OUT of window', () => {
		const since = windowSinceMs('4w', NOW)
		const justBefore = since - 1
		expect(justBefore < since).toBe(true)
	})

	it('defaults `now` to Date.now() when omitted', () => {
		const before = Date.now()
		const since = windowSinceMs('4w')
		const after = Date.now()
		// since ∈ [before - cutoff, after - cutoff]
		expect(since).toBeGreaterThanOrEqual(before - 28 * DAY_MS)
		expect(since).toBeLessThanOrEqual(after - 28 * DAY_MS)
	})
})

describe('utcDateKey', () => {
	it('formats unix epoch ms as YYYY-MM-DD in UTC', () => {
		// 2023-11-14T22:13:20.000Z
		expect(utcDateKey(1_700_000_000_000)).toBe('2023-11-14')
	})

	it('uses UTC, not local time — timestamps near midnight UTC stay on the UTC date', () => {
		// 2023-11-14T23:59:59.000Z → still 2023-11-14
		const lateUtc = Date.UTC(2023, 10, 14, 23, 59, 59)
		expect(utcDateKey(lateUtc)).toBe('2023-11-14')

		// 2023-11-15T00:00:00.000Z → 2023-11-15
		const midnightUtc = Date.UTC(2023, 10, 15, 0, 0, 0)
		expect(utcDateKey(midnightUtc)).toBe('2023-11-15')
	})

	it('is stable across DST boundaries (UTC has no DST)', () => {
		// US DST end: 2023-11-05T07:00:00Z (clocks fall back at 02:00 local)
		const dst = Date.UTC(2023, 10, 5, 7, 0, 0)
		expect(utcDateKey(dst)).toBe('2023-11-05')
	})

	it('handles unix epoch zero', () => {
		expect(utcDateKey(0)).toBe('1970-01-01')
	})
})
