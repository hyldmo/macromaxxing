import type { Equipment, MuscleGroup } from '@macromaxxing/db'

/** In-memory relation filters for exercise list rows (after DB fetch). */
export function matchesExerciseFilters(
	exercise: {
		name: string
		muscles: ReadonlyArray<{ muscleGroup: MuscleGroup }>
		equipment: ReadonlyArray<{ equipment: Equipment }>
	},
	filters: {
		muscleGroup?: MuscleGroup
		/** AND semantics: exercise must require every listed item. */
		equipment?: ReadonlyArray<Equipment>
	}
): boolean {
	if (filters.muscleGroup && !exercise.muscles.some(m => m.muscleGroup === filters.muscleGroup)) {
		return false
	}
	if (filters.equipment && filters.equipment.length > 0) {
		const have = new Set(exercise.equipment.map(e => e.equipment))
		for (const item of filters.equipment) {
			if (!have.has(item)) return false
		}
	}
	return true
}

export function applyOffsetLimit<T>(rows: T[], offset = 0, limit?: number): T[] {
	const start = Math.max(0, offset)
	if (limit === undefined) return rows.slice(start)
	return rows.slice(start, start + limit)
}
