// Heat-scale stops, ordered by intensity. Wider lightness/chroma swing than the macro tokens
// so the legend gradient has visible dynamic range (deep desaturated green → bright yellow →
// orange → deep saturated red). The body map itself uses the four macro tokens via
// intensityClass for clear bucketed reads — see below.
const HEAT_STOPS: Array<{ L: number; C: number; H: number }> = [
	{ L: 0.5, C: 0.08, H: 145 },
	{ L: 0.68, C: 0.13, H: 110 },
	{ L: 0.78, C: 0.15, H: 85 },
	{ L: 0.7, C: 0.18, H: 50 },
	{ L: 0.55, C: 0.22, H: 28 }
]

function stopToCss({ L, C, H }: { L: number; C: number; H: number }): string {
	return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`
}

/** Smooth CSS linear-gradient across the heat scale — for legends and any surface that wants
 * a continuous ramp. Body-map fills use intensityClass instead so each muscle reads as a clear
 * discrete bucket. */
export const HEAT_GRADIENT = `linear-gradient(in oklch to right, ${HEAT_STOPS.map(stopToCss).join(', ')})`

/** Map 0-1 intensity to one of four macro color classes (green=low → red=high).
 * Order: protein (green) → fat (yellow) → carbs (orange) → kcal (red). */
export function intensityClass(t: number): string {
	if (t < 0.33) return 'text-macro-protein'
	if (t < 0.66) return 'text-macro-fat'
	if (t < 0.85) return 'text-macro-carbs'
	return 'text-macro-kcal'
}
