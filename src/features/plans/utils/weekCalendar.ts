import type { AbsoluteMacros, MealPlan, Recipe } from '@macromaxxing/db'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type ActiveProgramRef, DAYS_SHORT, getWeekStart, pickNextWorkout } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type Summary = RouterOutput['dashboard']['summary']
export type CalendarPlan = Summary['plans'][number]
export type CalendarSession = Summary['sessions'][number]
export type CalendarTemplate = Summary['templates'][number]

type Slot = CalendarPlan['inventory'][number]['slots'][number]

const DAY_MS = 86_400_000

export interface CalendarMeal {
	id: Slot['id']
	recipeId: Recipe['id']
	name: string
	planId: MealPlan['id']
	planName: string
	/** Position within the day (breakfast → dinner), from `mealPlanSlots.slotIndex`. */
	slotIndex: number
	portions: number
	macros: AbsoluteMacros
}

export interface CalendarDay {
	/** 0 = Mon .. 6 = Sun, matching `mealPlanSlots.dayOfWeek` and `DAYS_SHORT`. */
	dayOfWeek: number
	/** Local midnight of the day. */
	date: number
	isToday: boolean
	isPast: boolean
	meals: CalendarMeal[]
	totals: AbsoluteMacros
	sessions: CalendarSession[]
}

export interface BuildWeekDaysInput {
	plans: readonly CalendarPlan[]
	sessions: readonly CalendarSession[]
	now: number
}

/** A plan belongs to the week it was created in — that's the week its slots describe. */
export function isPlanForWeek(plan: Pick<CalendarPlan, 'createdAt'>, weekStart: number): boolean {
	return getWeekStart(plan.createdAt) === weekStart
}

/**
 * Fold the (undated) meal-plan slots and the (dated) workout sessions onto one Mon–Sun grid
 * for the week containing `now`. A plan's `dayOfWeek` slots map onto the week the plan was
 * created in, so older plans are skipped entirely; sessions are matched by `startedAt`.
 */
export function buildWeekDays({ plans, sessions, now }: BuildWeekDaysInput): CalendarDay[] {
	const weekStart = getWeekStart(now)
	const todayIndex = Math.floor((now - weekStart) / DAY_MS)

	const mealsByDay: CalendarMeal[][] = DAYS_SHORT.map(() => [])
	for (const plan of plans) {
		if (!isPlanForWeek(plan, weekStart)) continue
		for (const inv of plan.inventory) {
			const recipe = inv.recipe
			const recipeTotals = calculateRecipeTotals(recipe.recipeIngredients.map(toIngredientWithAmount))
			const cookedWeight = getEffectiveCookedWeight(recipeTotals.weight, recipe.cookedWeight)
			const portionMacros = calculatePortionMacros(recipeTotals, cookedWeight, recipe.portionSize)

			for (const slot of inv.slots) {
				const meals = mealsByDay[slot.dayOfWeek]
				if (!meals) continue
				meals.push({
					id: slot.id,
					recipeId: recipe.id,
					name: recipe.name,
					planId: plan.id,
					planName: plan.name,
					slotIndex: slot.slotIndex,
					portions: slot.portions,
					macros: calculateSlotMacros(portionMacros, slot.portions)
				})
			}
		}
	}

	const sessionsByDay: CalendarSession[][] = DAYS_SHORT.map(() => [])
	for (const session of sessions) {
		const index = Math.floor((session.startedAt - weekStart) / DAY_MS)
		const day = sessionsByDay[index]
		if (index < 0 || !day) continue
		day.push(session)
	}

	return DAYS_SHORT.map((_, dayOfWeek) => {
		const meals = mealsByDay[dayOfWeek].toSorted((a, b) => a.slotIndex - b.slotIndex)
		return {
			dayOfWeek,
			date: weekStart + dayOfWeek * DAY_MS,
			isToday: dayOfWeek === todayIndex,
			isPast: dayOfWeek < todayIndex,
			meals,
			totals: calculateDayTotals(meals.map(m => m.macros)),
			sessions: sessionsByDay[dayOfWeek].toSorted((a, b) => a.startedAt - b.startedAt)
		}
	})
}

export interface ProjectUpcomingInput {
	days: readonly CalendarDay[]
	templates: readonly CalendarTemplate[]
	sessions: readonly CalendarSession[]
	activeProgram: ActiveProgramRef | null
}

/** The rotation, in cycle order: the active program's members, or every template as legacy fallback. */
function cycleTemplates(
	templates: readonly CalendarTemplate[],
	activeProgram: ActiveProgramRef | null
): CalendarTemplate[] {
	if (!activeProgram) return [...templates]
	const byId = new Map(templates.map(t => [t.id, t]))
	return activeProgram.workoutIds.flatMap(id => {
		const t = byId.get(id)
		return t ? [t] : []
	})
}

/**
 * Lay the rest of the rotation across the remaining days of the week, one workout per open day.
 * Programs carry no day-of-week schedule, so this is a straight projection from wherever the cycle
 * currently stands — capped at one pass, so a 5-workout rotation fills 5 days and leaves the rest
 * open rather than repeating itself. Days that already hold a session re-anchor the cycle instead
 * of getting a ghost.
 *
 * Returns `dayOfWeek → template`; the earliest entry is the "next" one the dashboard would start.
 */
export function projectUpcomingWorkouts({
	days,
	templates,
	sessions,
	activeProgram
}: ProjectUpcomingInput): Map<number, CalendarTemplate> {
	const upcoming = new Map<number, CalendarTemplate>()
	const cycle = cycleTemplates(templates, activeProgram)
	if (cycle.length === 0) return upcoming

	const next = pickNextWorkout(templates, sessions, activeProgram)
	const nextTemplate = next.kind === 'emptyActiveProgram' ? null : next.template
	if (!nextTemplate) return upcoming

	let cursor = Math.max(
		cycle.findIndex(t => t.id === nextTemplate.id),
		0
	)
	let placed = 0

	for (const day of days) {
		const logged = day.sessions.findLast(s => s.workoutId !== null && cycle.some(t => t.id === s.workoutId))
		if (logged) {
			cursor = cycle.findIndex(t => t.id === logged.workoutId) + 1
			continue
		}
		if (day.isPast || day.sessions.length > 0 || placed === cycle.length) continue
		upcoming.set(day.dayOfWeek, cycle[cursor % cycle.length])
		cursor++
		placed++
	}

	return upcoming
}
