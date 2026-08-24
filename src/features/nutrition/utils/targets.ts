import type { MacroTargets } from '@macromaxxing/db'

/** How far past a target counts as overshooting rather than hitting it. */
const TOLERANCE = 0.05

export type TargetStatus = 'under' | 'on' | 'over'

/**
 * What kind of number a target is, which decides whether exceeding it means anything.
 *
 * `budget` — over and under both matter. Calories only.
 * `floor` — hitting it is enough; anything above is free. Every macro.
 *
 * The two were conflated before, so a fat-heavy day showed carbs at 26% of "target" in the same
 * red as a genuinely missed fiber goal, even though the carb number was only ever the calories
 * left over after protein and fat. See `deriveMacroTargets`.
 */
export type TargetKind = 'budget' | 'floor'

/** The kind each field of `MacroTargets` carries. */
export const MACRO_TARGET_KIND: Record<keyof MacroTargets, TargetKind> = {
	kcal: 'budget',
	protein: 'floor',
	carbs: 'floor',
	fat: 'floor',
	fiber: 'floor'
}

/**
 * Where an actual value sits relative to its target, within a ±5% band.
 *
 * A non-positive target means nothing is required, so it reads `on` rather than a permanent
 * `under` — a custom goal with no fiber number should not sit red forever.
 */
export function targetStatus(actual: number, target: number, kind: TargetKind = 'budget'): TargetStatus {
	if (target <= 0) return 'on'
	if (actual >= target * (1 - TOLERANCE)) {
		return kind === 'floor' || actual <= target * (1 + TOLERANCE) ? 'on' : 'over'
	}
	return 'under'
}

/**
 * Signed difference, or '' when it rounds to nothing worth showing.
 *
 * A floor that has been cleared also returns '': the surplus is free calories, and rendering
 * `+147` next to a carb floor implies an overshoot that doesn't exist.
 */
export function targetDelta(actual: number, target: number, kind: TargetKind = 'budget'): string {
	const diff = Math.round(actual - target)
	if (diff === 0) return ''
	if (diff > 0) return kind === 'floor' ? '' : `+${diff}`
	return String(diff)
}
