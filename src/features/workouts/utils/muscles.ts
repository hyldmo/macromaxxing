import type { MuscleGroup } from '@macromaxxing/db'

/** Map 0-1 intensity to macro color classes (red=low → green=high) */
export function intensityClass(t: number): string {
	if (t < 0.33) return 'text-macro-kcal'
	if (t < 0.66) return 'text-macro-fat'
	if (t < 0.85) return 'text-macro-carbs'
	return 'text-macro-protein'
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
	chest: 'Chest',
	upper_back: 'Upper Back',
	lats: 'Lats',
	front_delts: 'Front Delts',
	side_delts: 'Side Delts',
	rear_delts: 'Rear Delts',
	biceps: 'Biceps',
	triceps: 'Triceps',
	forearms: 'Forearms',
	quads: 'Quads',
	hamstrings: 'Hamstrings',
	glutes: 'Glutes',
	calves: 'Calves',
	core: 'Core'
}
