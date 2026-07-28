import type { AbsoluteMacros, MacroTargets } from '@macromaxxing/db'
import type { FC } from 'react'
import { cn } from '~/lib'

/** Fraction of a target hit, clamped to [0, 1] — bars never overflow their track. */
const fill = (actual: number, target: number): number => (target > 0 ? Math.min(1, actual / target) : 0)

export interface MacroTargetBarsProps {
	totals: Pick<AbsoluteMacros, 'protein' | 'carbs' | 'fat'>
	targets: MacroTargets
	className?: string
}

/**
 * Three hairline progress bars (P/C/F) against the day's targets. Deliberately
 * uncolored past 100% — overshoot is only a problem for calories, and the kcal
 * readout carries that signal.
 */
export const MacroTargetBars: FC<MacroTargetBarsProps> = ({ totals, targets, className }) => (
	<div className={cn('flex gap-0.5', className)}>
		<Bar value={fill(totals.protein, targets.protein)} className="bg-macro-protein" />
		<Bar value={fill(totals.carbs, targets.carbs)} className="bg-macro-carbs" />
		<Bar value={fill(totals.fat, targets.fat)} className="bg-macro-fat" />
	</div>
)

const Bar: FC<{ value: number; className: string }> = ({ value, className }) => (
	<div className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-2">
		<div className={cn('h-full rounded-full', className)} style={{ width: `${value * 100}%` }} />
	</div>
)
