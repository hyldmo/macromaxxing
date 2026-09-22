import { mealPlanSlots, newId } from '@macromaxxing/db'
import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../router'

function createCaller(slotAmounts: { portions: number; displayAmount: number | null; displayUnit: string | null }) {
	const planId = newId('mpl')
	const slot = {
		id: newId('mps'),
		inventoryId: newId('mpi'),
		dayOfWeek: 0,
		slotIndex: 0,
		createdAt: Date.now(),
		...slotAmounts,
		inventory: {
			mealPlanId: planId,
			mealPlan: { userId: 'user_1' }
		}
	}

	const db = {
		query: {
			mealPlanSlots: {
				findFirst: vi.fn(async () => slot)
			}
		},
		update: vi.fn((table: unknown) => ({
			set: vi.fn((updates: Record<string, unknown>) => ({
				where: vi.fn(async () => {
					if (table === mealPlanSlots) Object.assign(slot, updates)
				})
			}))
		}))
	}

	const caller = appRouter.createCaller({ db: db as any, user: { id: 'user_1' } as any, env: {} as any })
	return { caller, slot }
}

describe('mealPlan.updateSlot move', () => {
	it('moves a recipe slot and keeps its custom portion count', async () => {
		const { caller, slot } = createCaller({ portions: 2.5, displayAmount: null, displayUnit: null })

		const moved = await caller.mealPlan.updateSlot({ slotId: slot.id, dayOfWeek: 3, slotIndex: 1 })

		expect(moved).toMatchObject({
			dayOfWeek: 3,
			slotIndex: 1,
			portions: 2.5,
			displayAmount: null,
			displayUnit: null
		})
	})

	it('moves an ingredient slot and keeps its custom amount and unit', async () => {
		const { caller, slot } = createCaller({ portions: 0.76, displayAmount: 2, displayUnit: 'small' })

		const moved = await caller.mealPlan.updateSlot({ slotId: slot.id, dayOfWeek: 3, slotIndex: 1 })

		expect(moved).toMatchObject({
			dayOfWeek: 3,
			slotIndex: 1,
			portions: 0.76,
			displayAmount: 2,
			displayUnit: 'small'
		})
	})
})
