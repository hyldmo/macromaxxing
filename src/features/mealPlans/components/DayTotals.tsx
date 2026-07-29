import type { AbsoluteMacros, MacroTargets } from '@macromaxxing/db'
import type { FC } from 'react'
import { KcalReadout } from '~/features/nutrition/components/KcalReadout'
import { MacroTargetBars } from '~/features/nutrition/components/MacroTargetBars'

export interface DayTotalsProps {
	totals: AbsoluteMacros
	/** Daily goals, or null when the user hasn't set one — totals then render bare. */
	targets: MacroTargets | null
}

export const DayTotals: FC<DayTotalsProps> = ({ totals, targets }) => {
	if (totals.kcal === 0) {
		return <div className="mt-1 h-10" /> // Placeholder to maintain alignment
	}

	return (
		<div className="mt-1 space-y-0.5 rounded-sm bg-surface-1 p-1 text-center">
			<div className="relative font-bold text-xs">
				<span className="relative">
					<KcalReadout kcal={totals.kcal} target={targets?.kcal ?? null} />
					<span className="absolute -bottom-px ml-0.5 font-mono text-[8px] text-ink-muted"> kcal</span>
				</span>
			</div>
			<div className="flex justify-center gap-1 font-mono text-[9px] text-ink-muted">
				<span className="font-semibold text-macro-protein">P{totals.protein.toFixed(0)}</span>
				<span className="text-macro-carbs">C{totals.carbs.toFixed(0)}</span>
				<span className="text-macro-fat">F{totals.fat.toFixed(0)}</span>
			</div>
			{targets && <MacroTargetBars totals={totals} targets={targets} />}
		</div>
	)
}
