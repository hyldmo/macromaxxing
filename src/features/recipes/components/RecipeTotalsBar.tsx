import type { FC } from 'react'
import type { AbsoluteMacros } from '~/lib/macros'
import { MacroBar } from './MacroBar'

export interface RecipeTotalsBarProps {
	totals: AbsoluteMacros
}

export const RecipeTotalsBar: FC<RecipeTotalsBarProps> = ({ totals }) => {
	return (
		<div className="rounded-md bg-surface-2/60 px-3 py-2">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm">
				<span className="font-semibold text-ink-muted">{totals.weight.toFixed(0)}g raw</span>
				<span className="text-macro-protein">P {totals.protein.toFixed(0)}</span>
				<span className="text-macro-carbs">C {totals.carbs.toFixed(0)}</span>
				<span className="text-macro-fat">F {totals.fat.toFixed(0)}</span>
				<span className="font-semibold text-macro-kcal">{totals.kcal.toFixed(0)} kcal</span>
			</div>
			<div className="mt-1.5">
				<MacroBar macros={totals} />
			</div>
		</div>
	)
}
