import type { AbsoluteMacros } from '@macromaxxing/db'
import type { FC } from 'react'

export interface DayTotalsProps {
	totals: AbsoluteMacros
}

export const DayTotals: FC<DayTotalsProps> = ({ totals }) => {
	if (totals.kcal === 0) {
		return <div className="mt-1 h-10" /> // Placeholder to maintain alignment
	}

	return (
		<div className="mt-1 rounded-sm bg-surface-1 p-1 text-center">
			<div className="relative font-bold font-mono text-macro-kcal text-xs tabular-nums">
				<span className="relative">
					{totals.kcal.toFixed(0)}
					<span className="absolute -bottom-px ml-0.5 text-[8px] text-ink-muted"> kcal</span>
				</span>
			</div>
			<div className="flex justify-center gap-1 font-mono text-[9px] text-ink-muted">
				<span className="font-semibold text-macro-protein">P{totals.protein.toFixed(0)}</span>
				<span className="text-macro-carbs">C{totals.carbs.toFixed(0)}</span>
				<span className="text-macro-fat">F{totals.fat.toFixed(0)}</span>
			</div>
		</div>
	)
}
