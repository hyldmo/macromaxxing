export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

export function midpoint({ min, max }: { min: number; max: number }): number {
	return (min + max) / 2
}

export function avg(...values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length
}
