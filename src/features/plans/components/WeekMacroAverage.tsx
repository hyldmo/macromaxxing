import type { MacroTargets } from '@macromaxxing/db'
import type { FC } from 'react'
import { KcalReadout } from '~/features/nutrition/components/KcalReadout'
import { MacroDelta } from '~/features/nutrition/components/MacroDelta'
import type { CalendarDay } from '~/features/plans/utils/weekCalendar'
import { calculateWeeklyAverage } from '~/features/recipes/utils/macros'

export interface WeekMacroAverageProps {
	days: readonly CalendarDay[]
	targets: MacroTargets | null
}

/**
 * Per-day average across the days that actually have meals on them (an unplanned Sunday
 * isn't a zero-calorie day), shown against the user's targets when they have any.
 */
export const WeekMacroAverage: FC<WeekMacroAverageProps> = ({ days, targets }) => {
	const filled = days.filter(d => d.totals.kcal > 0).length
	if (filled === 0) return null

	const avg = calculateWeeklyAverage(days.map(d => d.totals))

	return (
		<div className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
			<span className="font-sans text-ink-faint">avg</span>
			<KcalReadout kcal={avg.kcal} target={targets?.kcal ?? null} />
			<MacroDelta label="P" value={avg.protein} target={targets?.protein} className="text-macro-protein" />
			<MacroDelta label="C" value={avg.carbs} target={targets?.carbs} className="text-macro-carbs" />
			<MacroDelta label="F" value={avg.fat} target={targets?.fat} className="text-macro-fat" />
			<MacroDelta label="Fi" value={avg.fiber} target={targets?.fiber} className="text-macro-fiber" />
			<span className="font-sans text-ink-faint">{filled}d</span>
		</div>
	)
}
