import type { MacroTargets, NutritionGoal, Sex } from '@macromaxxing/db'

/** Brzycki 1RM estimate: weight * 36 / (37 - reps) */
export function estimated1RM(weightKg: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return weightKg
	return weightKg * (36 / (37 - reps))
}

/** Height-based limb length factor for leverage adjustment */
export function limbLengthFactor(heightCm: number): number {
	if (heightCm <= 185) return 1.0
	return 1 + (heightCm - 185) * 0.004
}

/** Total volume = Σ(weight * reps) */
export function totalVolume(logs: Array<{ weightKg: number; reps: number }>): number {
	return logs.reduce((sum, l) => sum + l.weightKg * l.reps, 0)
}

/** Work done in Joules: weight * 9.81 * ROM_meters * reps */
export function workDoneJoules(weightKg: number, reps: number, romMeters: number): number {
	return weightKg * 9.81 * romMeters * reps
}

/** Mifflin-St Jeor BMR estimate */
export function estimateBMR(weightKg: number, heightCm: number, age: number, sex: Sex): number {
	const base = 10 * weightKg + 6.25 * heightCm - 5 * age
	return sex === 'male' ? base + 5 : base - 161
}

/** TDEE = BMR * activity multiplier */
export function estimateTDEE(bmr: number, activityMultiplier: number): number {
	return bmr * activityMultiplier
}

/** Protein intake per kg bodyweight */
export function proteinPerKg(proteinGrams: number, weightKg: number): number {
	if (weightKg <= 0) return 0
	return proteinGrams / weightKg
}

/** Calorie offset for each nutrition goal */
const GOAL_KCAL_OFFSET: Record<Exclude<NutritionGoal, 'custom'>, number> = {
	cut: -500,
	maintain: 0,
	bulk: 300
}

/** Protein per kg bodyweight for each goal */
const GOAL_PROTEIN_PER_KG: Record<Exclude<NutritionGoal, 'custom'>, number> = {
	cut: 2.2,
	maintain: 1.8,
	bulk: 2.0
}

/** Derive macro targets from TDEE + nutrition goal */
export function deriveMacroTargets(
	tdee: number,
	weightKg: number,
	goal: Exclude<NutritionGoal, 'custom'>
): MacroTargets {
	const kcal = Math.round(tdee + GOAL_KCAL_OFFSET[goal])
	const protein = Math.round(weightKg * GOAL_PROTEIN_PER_KG[goal])
	const fat = Math.round((kcal * 0.25) / 9) // 25% of kcal from fat
	const proteinKcal = protein * 4
	const fatKcal = fat * 9
	const carbs = Math.round(Math.max(0, kcal - proteinKcal - fatKcal) / 4)
	const fiber = Math.round((kcal / 1000) * 14) // 14g per 1000 kcal (USDA guideline)
	return { kcal, protein, carbs, fat, fiber }
}
