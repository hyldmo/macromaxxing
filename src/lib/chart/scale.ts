/**
 * Pure scale helpers for hand-rolled SVG charts.
 *
 * Kept dependency-free and tested independently so chart components stay
 * declarative and we can verify the math without rendering JSX.
 */

/**
 * Map `value` from the input range [min, max] into the output range [outMin, outMax].
 *
 * Single-value safe: when `min === max` (e.g. one data point or a flat series)
 * the input range collapses, so we return the midpoint of the output range
 * rather than dividing by zero.
 */
export function linearScale(value: number, min: number, max: number, outMin: number, outMax: number): number {
	if (max === min) return (outMin + outMax) / 2
	return outMin + ((value - min) / (max - min)) * (outMax - outMin)
}

/**
 * Pick at most `maxLabels` evenly-spaced indices from a series of length `n`.
 *
 * Always includes the first and last index when `n >= 2`. For `n <= maxLabels`
 * every index is returned. Result is deduplicated and ascending.
 */
export function pickTickIndices(n: number, maxLabels = 6): number[] {
	if (n <= 0) return []
	if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i)
	const step = (n - 1) / (maxLabels - 1)
	const seen = new Set<number>()
	for (let i = 0; i < maxLabels; i++) {
		seen.add(Math.round(i * step))
	}
	return Array.from(seen).sort((a, b) => a - b)
}

/**
 * Format a tick date for the x-axis using the smallest unit that disambiguates
 * the series.
 *
 * - All timestamps fall on the same calendar day → `HH:mm` (intra-day session)
 * - All within the same calendar year         → `MMM dd` (e.g. "Mar 12")
 * - Spans multiple years                       → `MMM dd ''YY` (e.g. "Mar 12 '24")
 */
export function formatTickDate(timestamp: number, allTimestamps: readonly number[]): string {
	if (allTimestamps.length === 0) return ''

	const dates = allTimestamps.map(t => new Date(t))
	const date = new Date(timestamp)

	const sameDay = dates.every(
		d =>
			d.getFullYear() === dates[0].getFullYear() &&
			d.getMonth() === dates[0].getMonth() &&
			d.getDate() === dates[0].getDate()
	)
	if (sameDay) {
		return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
	}

	const sameYear = dates.every(d => d.getFullYear() === dates[0].getFullYear())
	if (sameYear) {
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
	}

	const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
	const yearShort = String(date.getFullYear()).slice(-2)
	return `${monthDay} '${yearShort}`
}
