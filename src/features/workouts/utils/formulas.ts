import type { Sex } from '@macromaxxing/db'

/** Brzycki 1RM estimate: weight * 36 / (37 - reps) */
export function estimated1RM(weightKg: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return weightKg
	return weightKg * (36 / (37 - reps))
}

/** Inverse Brzycki: working weight for a given 1RM and target reps */
export function weightForReps(oneRM: number, reps: number): number {
	if (reps <= 0 || reps >= 37) return oneRM
	return oneRM * ((37 - reps) / 36)
}

/** Round to nearest plate increment (2.5 kg) */
export function roundToPlate(weightKg: number): number {
	return Math.round(weightKg / 2.5) * 2.5
}

/**
 * Estimate a replacement exercise's working weight using strength standards.
 * Looks at all template exercises with known weights and finds a path
 * through the standards table to the replacement exercise.
 */
export function estimateReplacementWeight(
	replacementId: string,
	targetReps: number,
	templateExercises: Array<{ exerciseId: string; targetWeight: number | null; targetReps: number | null }>,
	standards: Array<{ compoundId: string; isolationId: string; maxRatio: number }>
): number | null {
	for (const te of templateExercises) {
		if (te.targetWeight == null || te.targetWeight <= 0) continue
		const known1RM = estimated1RM(te.targetWeight, te.targetReps ?? targetReps)

		// Direct: known is compound, replacement is isolation
		const directCI = standards.find(s => s.compoundId === te.exerciseId && s.isolationId === replacementId)
		if (directCI) {
			return roundToPlate(weightForReps(known1RM * directCI.maxRatio, targetReps))
		}

		// Direct: known is isolation, replacement is compound
		const directIC = standards.find(s => s.isolationId === te.exerciseId && s.compoundId === replacementId)
		if (directIC) {
			return roundToPlate(weightForReps(known1RM / directIC.maxRatio, targetReps))
		}

		// Transitive: both isolations of the same compound
		const knownAsIso = standards.find(s => s.isolationId === te.exerciseId)
		const replAsIso = standards.find(s => s.isolationId === replacementId)
		if (knownAsIso && replAsIso && knownAsIso.compoundId === replAsIso.compoundId) {
			const compound1RM = known1RM / knownAsIso.maxRatio
			return roundToPlate(weightForReps(compound1RM * replAsIso.maxRatio, targetReps))
		}
	}
	return null
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
