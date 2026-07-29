import type { MacroTargets } from '@macromaxxing/db'
import { Dumbbell, Plus } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router'
import { KcalReadout } from '~/features/nutrition/components/KcalReadout'
import { MacroTargetBars } from '~/features/nutrition/components/MacroTargetBars'
import type { CalendarDay } from '~/features/plans/utils/weekCalendar'
import { cn, DAYS_SHORT } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type Template = RouterOutput['dashboard']['summary']['templates'][number]

export interface WeekCalendarDayProps {
	day: CalendarDay
	/** This day's slot in the projected rotation, rendered as a ghost chip. */
	planned: Pick<Template, 'id' | 'name'> | null
	/** Marks the soonest projected workout — the one the dashboard would start next. */
	isNextUp: boolean
	/** Daily macro goals, or null when the user hasn't set one — totals then render bare. */
	targets: MacroTargets | null
	/** Log a meal onto this day. Omitted on read-only surfaces (e.g. the landing page demo). */
	onAddMeal?: (dayOfWeek: number) => void
}

export const WeekCalendarDay: FC<WeekCalendarDayProps> = ({ day, planned, isNextUp, targets, onAddMeal }) => {
	const isEmpty = day.meals.length === 0 && day.sessions.length === 0 && !planned

	return (
		<div
			className={cn(
				'group flex gap-2 rounded-md border p-2 md:flex-col md:gap-1',
				day.isToday ? 'border-accent bg-accent/5' : 'border-edge bg-surface-1',
				day.isPast && 'opacity-60'
			)}
		>
			<div className="flex w-12 shrink-0 items-baseline gap-1 md:w-auto md:justify-between">
				<span className={cn('font-medium text-xs', day.isToday ? 'text-accent' : 'text-ink-muted')}>
					{DAYS_SHORT[day.dayOfWeek]}
				</span>
				<span className="font-mono text-ink-faint text-xs tabular-nums">{new Date(day.date).getDate()}</span>
				{onAddMeal && (
					<button
						type="button"
						onClick={() => onAddMeal(day.dayOfWeek)}
						aria-label={`Add meal to ${DAYS_SHORT[day.dayOfWeek]}`}
						/* Always reachable on touch, where there is no hover to reveal it. */
						className="ml-auto rounded-sm p-0.5 text-ink-faint opacity-100 transition-colors hover:bg-surface-2 hover:text-ink md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
					>
						<Plus className="size-3.5" />
					</button>
				)}
			</div>

			<div className="min-w-0 flex-1 space-y-1">
				{day.sessions.map(session => (
					<Link
						key={session.id}
						to={`/workouts/sessions/${session.id}`}
						className="flex items-center gap-1 rounded-sm bg-accent/15 px-1.5 py-1 text-accent text-xs transition-colors hover:bg-accent/25"
					>
						<Dumbbell className="size-3 shrink-0" />
						<span className="truncate">{session.name ?? session.workout?.name ?? 'Session'}</span>
						<span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums opacity-70">
							{session.summary.hardSetCount}
						</span>
					</Link>
				))}

				{planned && (
					<Link
						to={`/workouts/${planned.id}`}
						className="flex items-center gap-1 rounded-sm border border-edge border-dashed px-1.5 py-1 text-ink-muted text-xs transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<Dumbbell className="size-3 shrink-0" />
						<span className="truncate">{planned.name}</span>
						{isNextUp && <span className="ml-auto shrink-0 text-[10px] text-ink-faint">next</span>}
					</Link>
				)}

				{day.meals.map(meal => (
					<Link
						key={meal.id}
						to={`/recipes/${meal.recipeId}`}
						className="flex items-baseline gap-1 rounded-sm px-1.5 py-0.5 text-xs transition-colors hover:bg-surface-2"
						title={`${meal.name} · ${meal.planName}`}
					>
						<span className="truncate text-ink">{meal.name}</span>
						{/* A bare ingredient was logged by weight, so show grams rather than a portion count. */}
						{meal.recipeType === 'ingredient' ? (
							<span className="shrink-0 font-mono text-[10px] text-ink-faint tabular-nums">
								{meal.macros.weight.toFixed(0)}g
							</span>
						) : (
							meal.portions !== 1 && (
								<span className="shrink-0 font-mono text-[10px] text-ink-faint tabular-nums">
									×{meal.portions}
								</span>
							)
						)}
						<span className="ml-auto shrink-0 font-mono text-[10px] text-macro-kcal tabular-nums">
							{meal.macros.kcal.toFixed(0)}
						</span>
					</Link>
				))}

				{isEmpty && <span className="px-1.5 text-ink-faint text-xs">Rest</span>}

				{day.totals.kcal > 0 && (
					<div className="space-y-1 border-edge border-t pt-1">
						{/* Wraps: at md the 7-column grid leaves ~85px per cell, and `1850/2400` plus
						    three macro tags does not fit on one line. */}
						<div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] tabular-nums">
							<KcalReadout kcal={day.totals.kcal} target={targets?.kcal ?? null} />
							<span className="text-macro-protein">P{day.totals.protein.toFixed(0)}</span>
							<span className="text-macro-carbs">C{day.totals.carbs.toFixed(0)}</span>
							<span className="text-macro-fat">F{day.totals.fat.toFixed(0)}</span>
						</div>
						{targets && <MacroTargetBars totals={day.totals} targets={targets} />}
					</div>
				)}
			</div>
		</div>
	)
}
