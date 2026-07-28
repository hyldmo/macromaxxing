import { describe, expect, it } from 'vitest'
import {
	deriveMacroTargets,
	estimateBMR,
	estimateProfileTDEE,
	resolveMacroTargets,
	type TargetSettings
} from './nutrition'

const profile = {
	weightKg: 80,
	heightCm: 180,
	age: 30,
	sex: 'male',
	activityLevel: 'moderate'
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
})

describe('deriveMacroTargets', () => {
	it('offsets calories by goal and scales protein with bodyweight', () => {
		expect(deriveMacroTargets(2500, 80, 'cut')).toMatchObject({ kcal: 2000, protein: 176 })
		expect(deriveMacroTargets(2500, 80, 'maintain')).toMatchObject({ kcal: 2500, protein: 144 })
		expect(deriveMacroTargets(2500, 80, 'bulk')).toMatchObject({ kcal: 2800, protein: 160 })
	})

	it('spends the calories left after protein and 25% fat on carbs', () => {
		const { kcal, protein, carbs, fat } = deriveMacroTargets(2500, 80, 'maintain')
		expect(fat).toBe(Math.round((kcal * 0.25) / 9))
		expect(carbs).toBe(Math.round((kcal - protein * 4 - fat * 9) / 4))
	})
})

describe('resolveMacroTargets', () => {
	it('derives from the body profile for non-custom goals', () => {
		const tdee = estimateProfileTDEE(profile)!
		expect(resolveMacroTargets(settings({ nutritionGoal: 'cut' }))).toEqual(deriveMacroTargets(tdee, 80, 'cut'))
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

	it('is null with no goal, or with a goal the profile cannot satisfy', () => {
		expect(resolveMacroTargets(settings({ nutritionGoal: null }))).toBeNull()
		expect(resolveMacroTargets(settings({ age: null }))).toBeNull()
		expect(resolveMacroTargets(settings({ nutritionGoal: 'custom' }))).toBeNull()
	})
})
