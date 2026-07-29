import type { MealPlan } from '@macromaxxing/db'
import { type FC, useMemo, useState } from 'react'
import { Spinner, TRPCError } from '~/components/ui'
import { AddToInventoryModal } from '~/features/mealPlans/components/AddToInventoryModal'
import { isPlanForWeek } from '~/features/mealPlans/utils/planWeek'
import { WeekCalendarDay } from '~/features/plans/components/WeekCalendarDay'
import { WeekMacroAverage } from '~/features/plans/components/WeekMacroAverage'
import { buildWeekDays, projectUpcomingWorkouts } from '~/features/plans/utils/weekCalendar'
import { getISOWeek, getWeekStart, getWeekStartDate } from '~/lib'
import { trpc } from '~/lib/trpc'

function formatWeekRange(start: number, end: number): string {
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
	return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`
}

/** Mon–Sun view of the current week, merging logged workouts with meals — and the surface you log onto. */
export const WeekCalendarSection: FC = () => {
	const summaryQuery = trpc.dashboard.summary.useQuery()
	// Pinned on mount so the grid doesn't shift under the user mid-session.
	const [now] = useState(() => Date.now())
	const weekStart = getWeekStart(now)
	const weekKey = getWeekStartDate(now)
	const [addTarget, setAddTarget] = useState<{ planId: MealPlan['id']; dayOfWeek: number } | null>(null)

	const data = summaryQuery.data
	const plans = data?.plans

	// buildWeekDays keeps only plans whose weekStart is this week; the flag drives the empty-state note.
	const weekPlan = plans?.find(p => isPlanForWeek(p, weekKey))
	const hasWeekPlan = Boolean(weekPlan)
	const targets = data?.macroTargets ?? null

	// Only fires the first time you log into a week — once a plan exists we already hold its id.
	const ensureWeek = trpc.mealPlan.ensureWeek.useMutation()

	async function handleAddMeal(dayOfWeek: number) {
		if (weekPlan) {
			setAddTarget({ planId: weekPlan.id, dayOfWeek })
			return
		}
		try {
			const plan = await ensureWeek.mutateAsync({ weekStart: weekKey, name: `W${getISOWeek(weekStart)}` })
			setAddTarget({ planId: plan.id, dayOfWeek })
		} catch {
			// Surfaced via ensureWeek.error below; rethrowing would just be an unhandled rejection.
		}
	}

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
			{/* Wraps: the macro-average readout is too wide to sit beside the heading on a phone. */}
			<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
				<h2 className="font-semibold text-ink">
					This week
					<span className="ml-2 font-mono font-normal text-ink-faint text-xs tabular-nums">
						W{getISOWeek(weekStart)} · {formatWeekRange(weekStart, days[6].date)}
					</span>
				</h2>
				{hasWeekPlan ? (
					<WeekMacroAverage days={days} targets={targets} />
				) : (
					<span className="text-ink-faint text-xs">No meal plan this week</span>
				)}
			</div>

			{ensureWeek.error && <TRPCError error={ensureWeek.error} />}

			<div className="grid grid-cols-1 gap-1 md:grid-cols-7">
				{days.map(day => (
					<WeekCalendarDay
						key={day.dayOfWeek}
						day={day}
						planned={upcoming.get(day.dayOfWeek) ?? null}
						isNextUp={day.dayOfWeek === nextDay}
						targets={targets}
						onAddMeal={handleAddMeal}
					/>
				))}
			</div>

			{addTarget && (
				<AddToInventoryModal
					planId={addTarget.planId}
					onClose={() => setAddTarget(null)}
					slotAllocation={{
						dayOfWeek: addTarget.dayOfWeek,
						// Append after the day's existing meals; the server resolves collisions anyway.
						slotIndex: days[addTarget.dayOfWeek].meals.length,
						inventory: weekPlan?.inventory ?? []
					}}
				/>
			)}
		</section>
	)
}
