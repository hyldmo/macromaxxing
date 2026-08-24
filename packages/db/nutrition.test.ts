import { describe, expect, it } from 'vitest'
import {
	activityFromTrainingFrequency,
	CARB_RDA_GRAMS,
	carbFloorPerKg,
	deriveMacroTargets,
	estimateBMR,
	estimateProfileTDEE,
	resolveActivityLevel,
	resolveMacroTargets,
	type TargetSettings
} from './nutrition'

const profile = {
	weightKg: 80,
	heightCm: 180,
	age: 30,
	sex: 'male',
	activityLevel: 'moderate',
	trainingSessionsPerWeek: null,
	trainingHardSetsPerWeek: null
} as const

const settings = (overrides: Partial<TargetSettings> = {}): TargetSettings => ({
	...profile,
	nutritionGoal: 'maintain',
	targetKcal: null,
	targetProtein: null,
	targetCarbs: null,
	targetFat: null,
	targetFiber: null,
	...overrides
})

describe('estimateBMR', () => {
	it('applies the Mifflin-St Jeor sex offset', () => {
		// 10×80 + 6.25×180 − 5×30 = 1775, +5 male / −161 female
		expect(estimateBMR(80, 180, 30, 'male')).toBe(1780)
		expect(estimateBMR(80, 180, 30, 'female')).toBe(1614)
	})
})

describe('estimateProfileTDEE', () => {
	it('multiplies BMR by the activity level', () => {
		expect(estimateProfileTDEE(profile)).toBeCloseTo(1780 * 1.55)
	})

	it('falls back to moderate when no activity level is set', () => {
		expect(estimateProfileTDEE({ ...profile, activityLevel: null })).toBeCloseTo(1780 * 1.55)
	})

	it('is null until height, weight and age are all filled in', () => {
		expect(estimateProfileTDEE({ ...profile, age: null })).toBeNull()
		expect(estimateProfileTDEE({ ...profile, weightKg: null })).toBeNull()
		expect(estimateProfileTDEE({ ...profile, heightCm: null })).toBeNull()
	})

	it('multiplies by the auto-resolved bracket', () => {
		const auto = { ...profile, activityLevel: 'auto', trainingSessionsPerWeek: 6 } as const
		expect(estimateProfileTDEE(auto)).toBeCloseTo(1780 * 1.725)
	})
})

describe('activityFromTrainingFrequency', () => {
	it('brackets logged frequency', () => {
		expect(activityFromTrainingFrequency(0)).toBe('sedentary')
		expect(activityFromTrainingFrequency(0.75)).toBe('sedentary')
		expect(activityFromTrainingFrequency(1)).toBe('light')
		expect(activityFromTrainingFrequency(2.9)).toBe('light')
		expect(activityFromTrainingFrequency(3)).toBe('moderate')
		expect(activityFromTrainingFrequency(5.5)).toBe('moderate')
		expect(activityFromTrainingFrequency(6)).toBe('active')
	})

	it('never reaches very_active — 1.9 implies a physical job a training log cannot see', () => {
		expect(activityFromTrainingFrequency(14)).toBe('active')
	})
})

describe('resolveActivityLevel', () => {
	it('passes fixed brackets through untouched', () => {
		expect(resolveActivityLevel({ ...profile, activityLevel: 'very_active' })).toBe('very_active')
	})

	it('defaults to moderate when unset', () => {
		expect(resolveActivityLevel({ ...profile, activityLevel: null })).toBe('moderate')
	})

	it('resolves auto from logged frequency', () => {
		expect(resolveActivityLevel({ ...profile, activityLevel: 'auto', trainingSessionsPerWeek: 4 })).toBe('moderate')
		expect(resolveActivityLevel({ ...profile, activityLevel: 'auto', trainingSessionsPerWeek: 0 })).toBe(
			'sedentary'
		)
	})

	it('keeps the neutral default when auto has no frequency to work from', () => {
		expect(resolveActivityLevel({ ...profile, activityLevel: 'auto', trainingSessionsPerWeek: null })).toBe(
			'moderate'
		)
	})
})

describe('carbFloorPerKg', () => {
	it('brackets weekly hard sets', () => {
		expect(carbFloorPerKg(0)).toBe(1.5)
		expect(carbFloorPerKg(9.9)).toBe(1.5)
		expect(carbFloorPerKg(10)).toBe(2)
		expect(carbFloorPerKg(29.9)).toBe(2)
		expect(carbFloorPerKg(30)).toBe(3)
		expect(carbFloorPerKg(59.9)).toBe(3)
		expect(carbFloorPerKg(60)).toBe(4)
		expect(carbFloorPerKg(200)).toBe(4)
	})
})

describe('deriveMacroTargets', () => {
	it('offsets calories by goal and scales protein with bodyweight', () => {
		expect(deriveMacroTargets(2500, 80, 'cut', 0)).toMatchObject({ kcal: 2000, protein: 176 })
		expect(deriveMacroTargets(2500, 80, 'maintain', 0)).toMatchObject({ kcal: 2500, protein: 144 })
		expect(deriveMacroTargets(2500, 80, 'bulk', 0)).toMatchObject({ kcal: 2800, protein: 160 })
	})

	it('sets fat as a per-kg floor rather than a share of calories', () => {
		// The share model tied fat to the budget, so a cut moved it. A floor does not.
		expect(deriveMacroTargets(2500, 80, 'maintain', 0).fat).toBe(56)
		expect(deriveMacroTargets(2500, 80, 'cut', 0).fat).toBe(56)
		expect(deriveMacroTargets(4000, 80, 'bulk', 0).fat).toBe(56)
	})

	it('scales the carb floor with weekly hard sets, not with leftover calories', () => {
		expect(deriveMacroTargets(2500, 80, 'maintain', 40).carbs).toBe(240)
		expect(deriveMacroTargets(2500, 80, 'maintain', 70).carbs).toBe(320)
		// Same training, far more calories: the floor holds instead of absorbing the surplus.
		expect(deriveMacroTargets(4000, 80, 'maintain', 40).carbs).toBe(240)
	})

	it('leaves calories belonging to no macro once every floor is met', () => {
		const { kcal, protein, carbs, fat } = deriveMacroTargets(2500, 80, 'maintain', 40)
		expect(protein * 4 + carbs * 4 + fat * 9).toBeLessThan(kcal)
	})

	it('never puts the carb floor below the RDA, however light or untrained', () => {
		// 50 kg × 1.5 g/kg = 75 g, under what the brain runs on.
		expect(deriveMacroTargets(2000, 50, 'maintain', 0).carbs).toBe(CARB_RDA_GRAMS)
	})

	it('squeezes carbs toward the budget on a deficit, stopping at the RDA', () => {
		// 80 kg, high volume: the floor wants 320 g, a 500 kcal deficit cannot pay for it.
		const cut = deriveMacroTargets(2200, 80, 'cut', 70)
		expect(cut.carbs).toBeGreaterThanOrEqual(CARB_RDA_GRAMS)
		expect(cut.carbs).toBeLessThan(320)
		// Protein and essential fat are paid first and stay untouched.
		expect(cut.protein).toBe(176)
		expect(cut.fat).toBe(56)
	})

	it('holds the RDA and lets the floors outrun an over-aggressive budget', () => {
		const targets = deriveMacroTargets(700, 80, 'cut', 70)
		expect(targets.carbs).toBe(CARB_RDA_GRAMS)
		expect(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9).toBeGreaterThan(targets.kcal)
	})

	it('never returns a negative goal, however small the TDEE', () => {
		// 30 kg / 100 cm / 120 y female sedentary is the floor saveProfile still accepts;
		// a 500 kcal deficit puts maintenance underwater.
		const targets = deriveMacroTargets(196.8, 30, 'cut', 0)
		for (const value of Object.values(targets)) expect(value).toBeGreaterThanOrEqual(0)
	})
})

describe('resolveMacroTargets', () => {
	it('derives from the body profile for non-custom goals', () => {
		const tdee = estimateProfileTDEE(profile)!
		expect(resolveMacroTargets(settings({ nutritionGoal: 'cut' }))).toEqual(deriveMacroTargets(tdee, 80, 'cut', 0))
	})

	it('scales the carb floor from logged hard sets', () => {
		const rested = resolveMacroTargets(settings({ trainingHardSetsPerWeek: 5 }))!
		const working = resolveMacroTargets(settings({ trainingHardSetsPerWeek: 65 }))!
		expect(working.carbs).toBeGreaterThan(rested.carbs)
	})

	it('falls to the lowest carb bracket when hard sets were not measured', () => {
		const unmeasured = resolveMacroTargets(settings({ trainingHardSetsPerWeek: null }))!
		expect(unmeasured.carbs).toBe(resolveMacroTargets(settings({ trainingHardSetsPerWeek: 0 }))!.carbs)
	})

	it('moves with bodyweight — the stored columns are ignored', () => {
		const heavier = resolveMacroTargets(settings({ weightKg: 90, targetKcal: 1 }))!
		const lighter = resolveMacroTargets(settings({ weightKg: 80, targetKcal: 1 }))!
		expect(heavier.kcal).toBeGreaterThan(lighter.kcal)
		expect(heavier.protein).toBeGreaterThan(lighter.protein)
	})

	it('reads the stored columns for a custom goal', () => {
		const custom = resolveMacroTargets(
			settings({
				nutritionGoal: 'custom',
				targetKcal: 2200,
				targetProtein: 180,
				targetCarbs: 200,
				targetFat: 70,
				targetFiber: 30
			})
		)
		expect(custom).toEqual({ kcal: 2200, protein: 180, carbs: 200, fat: 70, fiber: 30 })
	})

	it('defaults the custom columns it was not given to zero', () => {
		expect(resolveMacroTargets(settings({ nutritionGoal: 'custom', targetKcal: 2200 }))).toEqual({
			kcal: 2200,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0
		})
	})

	it('is null with no goal, or with a goal the profile cannot satisfy', () => {
		expect(resolveMacroTargets(settings({ nutritionGoal: null }))).toBeNull()
		expect(resolveMacroTargets(settings({ age: null }))).toBeNull()
		expect(resolveMacroTargets(settings({ nutritionGoal: 'custom' }))).toBeNull()
	})
})
