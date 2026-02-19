export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

export function avg(...values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length
}
