/** Map 0-1 intensity to macro color classes (red=low → green=high) */
export function intensityClass(t: number): string {
	if (t < 0.33) return 'text-macro-kcal'
	if (t < 0.66) return 'text-macro-fat'
	if (t < 0.85) return 'text-macro-carbs'
	return 'text-macro-protein'
}
