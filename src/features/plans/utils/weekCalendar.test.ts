import { describe, expect, it } from 'vitest'
import type { ActiveProgramRef } from '~/lib'
import {
	buildWeekDays,
	type CalendarPlan,
	type CalendarSession,
	type CalendarTemplate,
	projectUpcomingWorkouts
} from './weekCalendar'

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

function makeSession(startedAt: number, name: string, workoutId: string | null = null): CalendarSession {
	return {
		id: `wks_${name}`,
		name,
		workoutId,
		startedAt,
		completedAt: startedAt + 3_600_000,
		workout: { name },
		summary: { setCount: 12, hardSetCount: 10, volumeKg: 5000, exercises: [] }
	} as unknown as CalendarSession
}

function makeTemplates(count: number): CalendarTemplate[] {
	return Array.from(
		{ length: count },
		(_, i) =>
			({
				id: `wkt_${i}`,
				name: `W${i}`,
				trainingGoal: 'hypertrophy',
				// No exercises = no muscle overlap = no recovery debt, so these project back-to-back.
				exercises: []
			}) as unknown as CalendarTemplate
	)
}

function makeProgram(templates: readonly CalendarTemplate[]): ActiveProgramRef {
	return { id: 'wpr_1', name: 'Rotation', workoutIds: templates.map(t => t.id) } as unknown as ActiveProgramRef
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

describe('projectUpcomingWorkouts', () => {
	const WEEK_START = new Date(2026, 6, 27).getTime()

	function project(templates: CalendarTemplate[], sessions: CalendarSession[]) {
		const days = buildWeekDays({ plans: [], sessions, now: NOW })
		const upcoming = projectUpcomingWorkouts({
			days,
			templates,
			sessions,
			activeProgram: makeProgram(templates)
		})
		return [...upcoming.entries()].map(([dayOfWeek, t]) => [dayOfWeek, t.name])
	}

	it('spreads the whole rotation across the remaining days, one per day', () => {
		// Today is Wed (index 2), so Wed–Sun is 5 open days for a 5-workout rotation.
		expect(project(makeTemplates(5), [])).toEqual([
			[2, 'W0'],
			[3, 'W1'],
			[4, 'W2'],
			[5, 'W3'],
			[6, 'W4']
		])
	})

	it('stops after one pass instead of repeating a short rotation', () => {
		expect(project(makeTemplates(3), [])).toEqual([
			[2, 'W0'],
			[3, 'W1'],
			[4, 'W2']
		])
	})

	it('resumes the cycle after a session logged this week', () => {
		const templates = makeTemplates(5)
		// Wed's session is rotation slot 1, so Thu picks up at slot 2 and Wed gets no ghost.
		const sessions = [makeSession(WEEK_START + 2 * DAY_MS, 'wed', templates[1].id)]

		expect(project(templates, sessions)).toEqual([
			[3, 'W2'],
			[4, 'W3'],
			[5, 'W4'],
			[6, 'W0']
		])
	})

	it('never projects onto past days', () => {
		const days = buildWeekDays({ plans: [], sessions: [], now: NOW })
		const templates = makeTemplates(5)
		const upcoming = projectUpcomingWorkouts({
			days,
			templates,
			sessions: [],
			activeProgram: makeProgram(templates)
		})

		expect(upcoming.has(0)).toBe(false)
		expect(upcoming.has(1)).toBe(false)
	})

	it('returns nothing when the active program has no resolvable workouts', () => {
		const upcoming = projectUpcomingWorkouts({
			days: buildWeekDays({ plans: [], sessions: [], now: NOW }),
			templates: makeTemplates(3),
			sessions: [],
			activeProgram: { id: 'wpr_1', name: 'Empty', workoutIds: [] }
		})

		expect(upcoming.size).toBe(0)
	})
})

describe('projectUpcomingWorkouts recovery spacing', () => {
	/** Two workouts that both hammer chest — computeProgramRest prices the overlap, not the volume alone. */
	function pressWorkout(id: string, name: string, sets: number): CalendarTemplate {
		return {
			id,
			name,
			trainingGoal: 'hypertrophy',
			exercises: [
				{
					targetSets: sets,
					trainingGoal: null,
					exercise: { fatigueTier: 1, muscles: [{ muscleGroup: 'chest', intensity: 1 }] }
				}
			]
		} as unknown as CalendarTemplate
	}

	it('leaves rest days between workouts that share a muscle', () => {
		// 6 sets x tier-1 chest -> 24 + 6*6 = 60h -> 3 days between starts.
		const templates = [pressWorkout('wkt_a', 'Push A', 6), pressWorkout('wkt_b', 'Push B', 6)]
		const days = buildWeekDays({ plans: [], sessions: [], now: NOW })

		const upcoming = projectUpcomingWorkouts({
			days,
			templates,
			sessions: [],
			activeProgram: makeProgram(templates)
		})

		// Today is Wed (2): Push A Wed, Push B Sat — Thu/Fri are recovery.
		expect([...upcoming.entries()].map(([d, t]) => [d, t.name])).toEqual([
			[2, 'Push A'],
			[5, 'Push B']
		])
	})

	it('goes back-to-back when the transition shares no muscles', () => {
		const templates = [
			pressWorkout('wkt_a', 'Push', 6),
			{
				id: 'wkt_b',
				name: 'Legs',
				trainingGoal: 'hypertrophy',
				exercises: [
					{
						targetSets: 6,
						trainingGoal: null,
						exercise: { fatigueTier: 1, muscles: [{ muscleGroup: 'quads', intensity: 1 }] }
					}
				]
			} as unknown as CalendarTemplate
		]
		const days = buildWeekDays({ plans: [], sessions: [], now: NOW })

		const upcoming = projectUpcomingWorkouts({
			days,
			templates,
			sessions: [],
			activeProgram: makeProgram(templates)
		})

		expect([...upcoming.entries()].map(([d, t]) => [d, t.name])).toEqual([
			[2, 'Push'],
			[3, 'Legs']
		])
	})
})
