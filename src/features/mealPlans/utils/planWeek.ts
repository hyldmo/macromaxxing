import type { MealPlan, WeekStart } from '@macromaxxing/db'

/**
 * A plan's slots are weekday positions (`dayOfWeek` 0–6), so they only resolve to real dates against
 * the week the plan declares. Every "what am I eating now" surface (dashboard today, /plans calendar)
 * filters on this — without it, every past week's slots stack onto the same weekday.
 *
 * A null `weekStart` is a reusable template with no week of its own, so it never matches: templates
 * are things you copy into a week, not things you ate.
 */
export function isPlanForWeek(plan: Pick<MealPlan, 'weekStart'>, weekStart: WeekStart): boolean {
	return plan.weekStart === weekStart
}
