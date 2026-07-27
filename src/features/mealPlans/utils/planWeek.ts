import { getWeekStart } from '~/lib'

/**
 * A meal plan is an undated Mon–Sun template, so the week it was created in is the week its slots
 * describe. Every "what am I eating now" surface (dashboard today, /plans calendar) filters on this
 * — without it, an old plan's slots stack on top of the current one for the same weekday.
 */
export function isPlanForWeek(plan: { createdAt: number }, weekStart: number): boolean {
	return getWeekStart(plan.createdAt) === weekStart
}
