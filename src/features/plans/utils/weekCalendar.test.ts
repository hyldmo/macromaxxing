import { describe, expect, it } from 'vitest'
import { buildWeekDays, type CalendarPlan, type CalendarSession } from './weekCalendar'

// Wednesday 2026-07-29, 12:00 local. Week runs Mon 27th → Sun Aug 2nd.
const NOW = new Date(2026, 6, 29, 12).getTime()
const DAY_MS = 86_400_000

// Fixtures cast at the boundary — buildWeekDays only reads the fields spelled out here.
function makePlan(
	name: string,
	slots: Array<{ dayOfWeek: number; slotIndex: number; portions: number }>,
	createdAt = NOW,
	kcalPer100g = 200
): CalendarPlan {
	return {
		id: `mpl_${name}`,
		name,
		createdAt,
		inventory: [
			{
				id: `mpi_${name}`,
				recipe: {
					id: `rcp_${name}`,
					name: `${name} recipe`,
					cookedWeight: 100,
					portionSize: 100,
					recipeIngredients: [
						{
							amountGrams: 100,
							ingredient: {
								protein: 10,
								carbs: 20,
								fat: 5,
								kcal: kcalPer100g,
								fiber: 2
							}
						}
					]
				},
				slots: slots.map((slot, i) => ({ id: `mps_${name}_${i}`, ...slot }))
			}
		]
	} as unknown as CalendarPlan
}

function makeSession(startedAt: number, name: string): CalendarSession {
	return {
		id: `wks_${name}`,
		name,
		startedAt,
		completedAt: startedAt + 3_600_000,
		workout: { name },
		summary: { setCount: 12, hardSetCount: 10, volumeKg: 5000, exercises: [] }
	} as unknown as CalendarSession
}

describe('buildWeekDays', () => {
	it('maps plan slots onto the matching weekday and totals their macros', () => {
		const days = buildWeekDays({
			plans: [
				makePlan('a', [
					{ dayOfWeek: 0, slotIndex: 1, portions: 1 },
					{ dayOfWeek: 0, slotIndex: 0, portions: 2 },
					{ dayOfWeek: 6, slotIndex: 0, portions: 1 }
				])
			],
			sessions: [],
			now: NOW
		})

		expect(days).toHaveLength(7)
		// Sorted by slotIndex, not insertion order
		expect(days[0].meals.map(m => m.portions)).toEqual([2, 1])
		expect(days[0].totals.kcal).toBe(600)
		expect(days[1].meals).toEqual([])
		expect(days[1].totals.kcal).toBe(0)
		expect(days[6].totals.kcal).toBe(200)
	})

	it('merges meals from every plan passed in', () => {
		const days = buildWeekDays({
			plans: [
				makePlan('a', [{ dayOfWeek: 2, slotIndex: 0, portions: 1 }]),
				makePlan('b', [{ dayOfWeek: 2, slotIndex: 1, portions: 1 }])
			],
			sessions: [],
			now: NOW
		})

		expect(days[2].meals.map(m => m.planName)).toEqual(['a', 'b'])
	})

	it('ignores plans created outside the current week', () => {
		const lastWeek = new Date(2026, 6, 22, 9).getTime()
		const days = buildWeekDays({
			plans: [
				makePlan('old', [{ dayOfWeek: 2, slotIndex: 0, portions: 1 }], lastWeek),
				makePlan('current', [{ dayOfWeek: 2, slotIndex: 1, portions: 1 }])
			],
			sessions: [],
			now: NOW
		})

		expect(days[2].meals.map(m => m.planName)).toEqual(['current'])
		expect(days[2].totals.kcal).toBe(200)
	})

	it('places sessions by startedAt and drops ones outside the current week', () => {
		const weekStart = new Date(2026, 6, 27).getTime()
		const days = buildWeekDays({
			plans: [],
			sessions: [
				makeSession(weekStart + 2 * DAY_MS + 3_600_000, 'wed'),
				makeSession(weekStart - DAY_MS, 'lastSunday'),
				makeSession(weekStart + 7 * DAY_MS, 'nextMonday'),
				makeSession(weekStart + 2 * DAY_MS, 'wedEarly')
			],
			now: NOW
		})

		expect(days.flatMap(d => d.sessions.map(s => s.name))).toEqual(['wedEarly', 'wed'])
		expect(days[2].sessions).toHaveLength(2)
	})

	it('flags today and past days', () => {
		const days = buildWeekDays({ plans: [], sessions: [], now: NOW })

		expect(days.map(d => d.isToday)).toEqual([false, false, true, false, false, false, false])
		expect(days.map(d => d.isPast)).toEqual([true, true, false, false, false, false, false])
	})
})
