import type { AbsoluteMacros } from '@macromaxxing/db'
import type { FC } from 'react'
import { MacroBar } from './MacroBar'
import { MacroReadout } from './MacroReadout'
import { MacroRing } from './MacroRing'

export interface CookPortionSummaryProps {
	portion: AbsoluteMacros
}

export const CookPortionSummary: FC<CookPortionSummaryProps> = ({ portion }) => (
	<div className="rounded-md border border-edge bg-gradient-to-b from-surface-1 to-surface-0 p-4">
		<h3 className="mb-3 text-center font-semibold text-ink-muted text-xs uppercase tracking-wider">Per Portion</h3>
		<div className="flex flex-col items-center gap-3">
			<MacroRing ratio="macro" macros={portion} size="lg" />
			<div className="grid grid-cols-4 gap-x-6 gap-y-2">
				<MacroReadout label="Protein" value={portion.protein} type="protein" />
				<MacroReadout label="Carbs" value={portion.carbs} type="carbs" />
				<MacroReadout label="Fat" value={portion.fat} type="fat" />
				<MacroReadout label="Fiber" value={portion.fiber} type="fiber" />
			</div>
			<MacroBar macros={portion} />
		</div>
	</div>
)
