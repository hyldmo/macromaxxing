/** Map 0-1 intensity to macro color classes (green=low → red=high) */
export function intensityClass(t: number): string {
	if (t < 0.33) return 'text-macro-protein'
	if (t < 0.66) return 'text-macro-carbs'
	if (t < 0.85) return 'text-macro-fat'
	return 'text-macro-kcal'
}
