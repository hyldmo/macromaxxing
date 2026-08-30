import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../router'

const savedSettings = {
	nutritionGoal: 'maintain' as const,
	activityLevel: 'moderate' as const,
	heightCm: 180,
	weightKg: 80,
	age: 30,
	sex: 'male' as const,
	targetKcal: null,
	targetProtein: null,
	targetCarbs: null,
	targetFat: null,
	targetFiber: null
}

function createCaller() {
	const db = {
		query: { userSettings: { findFirst: vi.fn().mockResolvedValue(savedSettings) } },
		$count: vi.fn().mockResolvedValue(0),
		select: vi.fn(() => ({
			from: () => ({
				innerJoin: () => ({ where: vi.fn().mockResolvedValue([{ hardSets: 0 }]) })
			})
		}))
	}

	return appRouter.createCaller({ db: db as any, user: { id: 'user_1' } as any, env: {} as any })
}

describe('settings.getTargets', () => {
	it('uses the saved goal unless a derived goal is requested', async () => {
		const caller = createCaller()

		const saved = await caller.settings.getTargets()
		const cut = await caller.settings.getTargets({ nutritionGoal: 'cut' })

		expect(saved.nutritionGoal).toBe('maintain')
		expect(saved.targets).toMatchObject({ kcal: 2759, protein: 144 })
		expect(cut.nutritionGoal).toBe('cut')
		expect(cut.targets).toMatchObject({ kcal: 2259, protein: 176 })
	})
})
