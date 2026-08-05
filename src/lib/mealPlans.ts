import type { MealPlan } from '@macromaxxing/db'
import { fromDateKey, getISOWeek } from './date'

/**
 * What to call a plan. `name` is optional — most plans are just "the week", so an unnamed one reads
 * as its ISO week number rather than forcing every logger to invent a title. Every surface that
 * shows a plan goes through here, so an unnamed plan never renders as blank or `null`.
 */
export function mealPlanLabel(plan: Pick<MealPlan, 'name' | 'weekStart'>): string {
	if (plan.name) return plan.name
	return plan.weekStart ? `Week ${getISOWeek(fromDateKey(plan.weekStart))}` : 'Untitled template'
}
