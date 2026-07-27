import { type FC, useMemo, useState } from 'react'
import { Spinner, TRPCError } from '~/components/ui'
import { WeekCalendarDay } from '~/features/plans/components/WeekCalendarDay'
import { buildWeekDays, isPlanForWeek, projectUpcomingWorkouts } from '~/features/plans/utils/weekCalendar'
import { getISOWeek, getWeekStart } from '~/lib'
import { trpc } from '~/lib/trpc'

function formatWeekRange(start: number, end: number): string {
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
	return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`
}

/** Read-only Mon–Sun view of the current week, merging logged workouts with planned meals. */
export const WeekCalendarSection: FC = () => {
	const summaryQuery = trpc.dashboard.summary.useQuery()
	// Pinned on mount so the grid doesn't shift under the user mid-session.
	const [now] = useState(() => Date.now())
	const weekStart = getWeekStart(now)

	const data = summaryQuery.data
	const plans = data?.plans

	// buildWeekDays keeps only plans created in this week; the flag drives the empty-state note.
	const hasWeekPlan = plans?.some(p => isPlanForWeek(p, weekStart)) ?? false

	const days = useMemo(
		() => buildWeekDays({ plans: plans ?? [], sessions: data?.sessions ?? [], now }),
		[plans, data?.sessions, now]
	)

	// The rest of the rotation, spread across the week's open days.
	const upcoming = useMemo(
		() =>
			projectUpcomingWorkouts({
				days,
				templates: data?.templates ?? [],
				sessions: data?.sessions ?? [],
				activeProgram: data?.activeProgram ?? null
			}),
		[days, data?.templates, data?.sessions, data?.activeProgram]
	)
	const nextDay = Math.min(...upcoming.keys())

	if (summaryQuery.isLoading) {
		return (
			<div className="flex justify-center py-6">
				<Spinner />
			</div>
		)
	}

	if (summaryQuery.error) return <TRPCError error={summaryQuery.error} />

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<h2 className="font-semibold text-ink">
					This week
					<span className="ml-2 font-mono font-normal text-ink-faint text-xs tabular-nums">
						W{getISOWeek(weekStart)} · {formatWeekRange(weekStart, days[6].date)}
					</span>
				</h2>
				{!hasWeekPlan && <span className="text-ink-faint text-xs">No meal plan this week</span>}
			</div>

			<div className="grid grid-cols-1 gap-1 md:grid-cols-7">
				{days.map(day => (
					<WeekCalendarDay
						key={day.dayOfWeek}
						day={day}
						planned={upcoming.get(day.dayOfWeek) ?? null}
						isNextUp={day.dayOfWeek === nextDay}
					/>
				))}
			</div>
		</section>
	)
}
