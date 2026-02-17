import type { FC } from 'react'
import { cn } from '~/lib/cn'
import type { AbsoluteMacros, MacroTargets } from '~/lib/macros'

export interface DayTotalsProps {
	totals: AbsoluteMacros
	targets?: MacroTargets | null
}

function pct(actual: number, target: number): number {
	if (target <= 0) return 0
	return Math.min(100, (actual / target) * 100)
}

export const DayTotals: FC<DayTotalsProps> = ({ totals, targets }) => {
	if (totals.kcal === 0) {
		return <div className="mt-1 h-10" /> // Placeholder to maintain alignment
	}

	const hasTargets = targets != null && targets.kcal > 0

	return (
		<div className="mt-1 rounded-sm bg-surface-1 p-1 text-center">
			<div className="font-bold font-mono text-macro-kcal text-xs tabular-nums">
				{totals.kcal.toFixed(0)}
				{hasTargets && (
					<span
						className={cn(
							'ml-0.5 font-normal text-[9px]',
							totals.kcal > targets.kcal * 1.05 ? 'text-destructive' : 'text-ink-faint'
						)}
					>
						/{targets.kcal}
					</span>
				)}
			</div>
			<div className="flex justify-center gap-1 font-mono text-[9px] text-ink-muted">
				<span className="font-semibold text-macro-protein">P{totals.protein.toFixed(0)}</span>
				<span className="text-macro-carbs">C{totals.carbs.toFixed(0)}</span>
				<span className="text-macro-fat">F{totals.fat.toFixed(0)}</span>
			</div>
			{hasTargets && (
				<div className="mt-0.5 flex gap-0.5">
					<TargetBar value={pct(totals.protein, targets.protein)} color="bg-macro-protein" />
					<TargetBar value={pct(totals.carbs, targets.carbs)} color="bg-macro-carbs" />
					<TargetBar value={pct(totals.fat, targets.fat)} color="bg-macro-fat" />
				</div>
			)}
		</div>
	)
}

interface TargetBarProps {
	value: number
	color: string
}

const TargetBar: FC<TargetBarProps> = ({ value, color }) => (
	<div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
		<div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
	</div>
)
