import type { AbsoluteMacros, MealPlan, Recipe } from '@macromaxxing/db'
import { isPlanForWeek } from '~/features/mealPlans/utils/planWeek'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import {
	type ActiveProgramRef,
	DAYS_SHORT,
	getWeekStart,
	getWeekStartDate,
	mealPlanLabel,
	type ProgramSkip,
	pickNextWorkout
} from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { recoveryHoursFromPriorSession } from '~/lib/workouts/muscleReadiness'
import { computeProgramRest } from '~/lib/workouts/programRest'

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
	/** `ingredient` wrappers hold exactly 100g, so their portions read as an amount, not a count. */
	recipeType: Recipe['type']
	planId: MealPlan['id']
	planName: string
	/** Position within the day (breakfast → dinner), from `mealPlanSlots.slotIndex`. */
	slotIndex: number
	portions: number
	/** What was typed when the meal was logged — `2` + `small`. Null for recipes and older rows. */
	displayAmount: number | null
	displayUnit: string | null
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

/**
 * Fold the (weekday-indexed) meal-plan slots and the (dated) workout sessions onto one Mon–Sun grid
 * for the week containing `now`. A plan's `dayOfWeek` slots map onto the week the plan declares via
 * `weekStart`, so other weeks' plans and undated templates are skipped; sessions match by `startedAt`.
 */
export function buildWeekDays({ plans, sessions, now }: BuildWeekDaysInput): CalendarDay[] {
	const weekStart = getWeekStart(now)
	const weekKey = getWeekStartDate(now)
	const todayIndex = Math.floor((now - weekStart) / DAY_MS)

	const mealsByDay: CalendarMeal[][] = DAYS_SHORT.map(() => [])
	for (const plan of plans) {
		if (!isPlanForWeek(plan, weekKey)) continue
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
					recipeType: recipe.type,
					planId: plan.id,
					planName: mealPlanLabel(plan),
					slotIndex: slot.slotIndex,
					portions: slot.portions,
					displayAmount: slot.displayAmount,
					displayUnit: slot.displayUnit,
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
	skips?: readonly ProgramSkip[]
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
 * Lay the rest of the rotation across the remaining days of the week, respecting the recovery debt
 * each transition carries: `computeProgramRest` prices the muscles a workout shares with the one
 * after it, and the projection leaves that many days open before placing the next ghost (floor of
 * one day, so a no-overlap transition still goes back-to-back rather than twice in a day).
 *
 * Programs carry no day-of-week schedule, so placement is otherwise "as early as recovery allows",
 * capped at one pass so a 5-workout rotation can't repeat itself inside a week. Days that already
 * hold a session re-anchor the cycle — the logged workout sets both the next position and the rest
 * owed from it — instead of getting a ghost.
 *
 * Returns `dayOfWeek → template`; the earliest entry is the "next" one the dashboard would start.
 */
export function projectUpcomingWorkouts({
	days,
	templates,
	sessions,
	activeProgram,
	skips
}: ProjectUpcomingInput): Map<number, CalendarTemplate> {
	const upcoming = new Map<number, CalendarTemplate>()
	const cycle = cycleTemplates(templates, activeProgram)
	if (cycle.length === 0) return upcoming

	const next = pickNextWorkout(templates, sessions, activeProgram, skips)
	const nextTemplate = next.kind === 'emptyActiveProgram' ? null : next.template
	if (!nextTemplate) return upcoming

	// Rest owed after cycle[i] before cycle[i+1], in whole days — the grid has no finer resolution.
	// Planned days can only be priced from the template; a day that was actually trained is priced
	// from its logged working sets instead, so a session cut short frees the next day sooner.
	const transitions = computeProgramRest(cycle)
	const toDays = (hours: number): number => Math.max(1, Math.ceil(hours / 24))
	const restDaysAfter = (index: number): number => toDays(transitions[index % cycle.length]?.bottleneckHours ?? 0)

	let cursor = Math.max(
		cycle.findIndex(t => t.id === nextTemplate.id),
		0
	)
	let placed = 0
	let earliestDay = -1

	for (const day of days) {
		const logged = day.sessions.findLast(s => s.workoutId !== null && cycle.some(t => t.id === s.workoutId))
		if (logged) {
			const loggedIdx = cycle.findIndex(t => t.id === logged.workoutId)
			cursor = loggedIdx + 1
			earliestDay = day.dayOfWeek + toDays(recoveryHoursFromPriorSession(logged, cycle[cursor % cycle.length]))
			continue
		}
		if (day.isPast || day.sessions.length > 0 || placed === cycle.length) continue
		if (day.dayOfWeek < earliestDay) continue // still recovering from the previous workout
		upcoming.set(day.dayOfWeek, cycle[cursor % cycle.length])
		earliestDay = day.dayOfWeek + restDaysAfter(cursor)
		cursor++
		placed++
	}

	return upcoming
}
