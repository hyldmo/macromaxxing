/**
 * Pure nutrition math shared between the frontend (`src/`) and the Cloudflare
 * Workers backend (`workers/`) — same rule as `formulas.ts`: no DB access, no I/O.
 *
 * Targets are DERIVED, not stored, whenever the goal is cut/maintain/bulk: the
 * user's body profile is the source of truth, so a weight change moves the
 * targets with it. Only `custom` reads the explicit `target*` columns.
 */

import type { ActivityLevel, ActivitySetting, NutritionGoal, Sex } from './custom-types'
import type { MacroTargets } from './types'

/** TDEE multiplier per activity level (Mifflin-St Jeor convention). */
export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
	sedentary: 1.2,
	light: 1.375,
	moderate: 1.55,
	active: 1.725,
	very_active: 1.9
}

/** What an unset — or unresolvable `auto` — activity level falls back to. */
export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = 'moderate'

/**
 * Logged sessions per week → Mifflin bracket, highest threshold first.
 *
 * Capped at `active`: `very_active` (1.9) describes a physically demanding JOB or two-a-days,
 * which a training log can't evidence — a 6×/week lifter with a desk job is not 1.9. That, plus
 * un-logged cardio/sport/manual labour, is why the fixed brackets stay selectable.
 */
const AUTO_ACTIVITY_BRACKETS: ReadonlyArray<readonly [minSessionsPerWeek: number, ActivityLevel]> = [
	[6, 'active'],
	[3, 'moderate'],
	[1, 'light'],
	[0, 'sedentary']
]

/** The bracket a given training frequency lands in. */
export function activityFromTrainingFrequency(sessionsPerWeek: number): ActivityLevel {
	return AUTO_ACTIVITY_BRACKETS.find(([min]) => sessionsPerWeek >= min)?.[1] ?? 'sedentary'
}

/** Daily calorie offset from maintenance for each goal. */
const GOAL_KCAL_OFFSET: Record<Exclude<NutritionGoal, 'custom'>, number> = {
	cut: -500,
	maintain: 0,
	bulk: 300
}

/** Protein per kg bodyweight for each goal — higher on a cut to spare lean mass. */
const GOAL_PROTEIN_PER_KG: Record<Exclude<NutritionGoal, 'custom'>, number> = {
	cut: 2.2,
	maintain: 1.8,
	bulk: 2.0
}

/** Share of calories from fat; the remainder after protein goes to carbs. */
const FAT_KCAL_SHARE = 0.25

/** USDA guideline: 14 g fiber per 1000 kcal. */
const FIBER_PER_1000_KCAL = 14

/** Mifflin-St Jeor BMR estimate */
export function estimateBMR(weightKg: number, heightCm: number, age: number, sex: Sex): number {
	const base = 10 * weightKg + 6.25 * heightCm - 5 * age
	return sex === 'male' ? base + 5 : base - 161
}

/** TDEE = BMR × activity multiplier */
export function estimateTDEE(bmr: number, activityMultiplier: number): number {
	return bmr * activityMultiplier
}

/** The body-profile inputs TDEE needs. `null` on any of them means no TDEE. */
export interface BodyProfile {
	weightKg: number | null
	heightCm: number | null
	age: number | null
	sex: Sex
	activityLevel: ActivitySetting | null
	/**
	 * Completed sessions per week over the trailing window — only read when the setting is `auto`.
	 * Required rather than optional so a caller can't quietly omit it and land an `auto` user in
	 * the wrong bracket; `null` means "not measured here" and keeps the neutral default.
	 */
	trainingSessionsPerWeek: number | null
}

/** The concrete bracket a profile's activity setting resolves to. */
export function resolveActivityLevel(profile: BodyProfile): ActivityLevel {
	const setting = profile.activityLevel ?? DEFAULT_ACTIVITY_LEVEL
	if (setting !== 'auto') return setting
	// An unknown frequency stays neutral instead of dropping to sedentary — guessing 1.2 for
	// someone who trains understates their targets by ~600 kcal, which is worse than guessing high.
	return profile.trainingSessionsPerWeek == null
		? DEFAULT_ACTIVITY_LEVEL
		: activityFromTrainingFrequency(profile.trainingSessionsPerWeek)
}

/** TDEE for a body profile, or null when height/weight/age aren't filled in yet. */
export function estimateProfileTDEE(profile: BodyProfile): number | null {
	const { weightKg, heightCm, age } = profile
	if (!(weightKg && heightCm && age)) return null
	const bmr = estimateBMR(weightKg, heightCm, age, profile.sex)
	return estimateTDEE(bmr, ACTIVITY_MULTIPLIER[resolveActivityLevel(profile)])
}

/** Derive macro targets from TDEE + bodyweight + goal. */
export function deriveMacroTargets(
	tdee: number,
	weightKg: number,
	goal: Exclude<NutritionGoal, 'custom'>
): MacroTargets {
	// Every field floors at 0: a tiny TDEE (light, elderly, on a cut) can push the
	// deficit past maintenance, and a negative calorie or fat goal is never meaningful.
	const kcal = Math.max(0, Math.round(tdee + GOAL_KCAL_OFFSET[goal]))
	const protein = Math.max(0, Math.round(weightKg * GOAL_PROTEIN_PER_KG[goal]))
	const fat = Math.round((kcal * FAT_KCAL_SHARE) / 9)
	const carbs = Math.round(Math.max(0, kcal - protein * 4 - fat * 9) / 4)
	const fiber = Math.round((kcal / 1000) * FIBER_PER_1000_KCAL)
	return { kcal, protein, carbs, fat, fiber }
}

/** Targets for a body profile + goal, or null when the profile can't produce a TDEE yet. */
export function deriveProfileTargets(
	profile: BodyProfile,
	goal: Exclude<NutritionGoal, 'custom'>
): MacroTargets | null {
	const tdee = estimateProfileTDEE(profile)
	if (tdee == null || !profile.weightKg) return null
	return deriveMacroTargets(tdee, profile.weightKg, goal)
}

/** The stored columns a `custom` goal reads from. */
export interface StoredTargets {
	targetKcal: number | null
	targetProtein: number | null
	targetCarbs: number | null
	targetFat: number | null
	targetFiber: number | null
}

export type TargetSettings = BodyProfile & StoredTargets & { nutritionGoal: NutritionGoal | null }

/**
 * The targets every consumer should render against: derived from the body profile for
 * cut/maintain/bulk, read from the stored columns for `custom`, null when the user
 * hasn't set a goal (or hasn't filled in the profile a derived goal needs).
 */
export function resolveMacroTargets(settings: TargetSettings): MacroTargets | null {
	const goal = settings.nutritionGoal
	if (!goal) return null

	if (goal === 'custom') {
		if (!settings.targetKcal) return null
		return {
			kcal: settings.targetKcal,
			protein: settings.targetProtein ?? 0,
			carbs: settings.targetCarbs ?? 0,
			fat: settings.targetFat ?? 0,
			fiber: settings.targetFiber ?? 0
		}
	}

	return deriveProfileTargets(settings, goal)
}
