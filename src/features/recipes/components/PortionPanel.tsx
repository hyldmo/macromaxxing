import type { AbsoluteMacros } from '@macromaxxing/db'
import type { FC } from 'react'
import { CookedWeightInput } from './CookedWeightInput'
import { DiscardedFatInput } from './DiscardedFatInput'
import { MacroReadout } from './MacroReadout'
import { MacroRing } from './MacroRing'
import { PortionSizeInput } from './PortionSizeInput'

export interface PortionPanelProps {
	portion: AbsoluteMacros
	cookedWeight: number | null
	rawTotal: number
	discardedFat: number | null
	portionSize: number | null
	effectiveCookedWeight: number
	onCookedWeightChange?: (value: number | null) => void
	onDiscardedFatChange?: (value: number | null) => void
	onPortionSizeChange?: (value: number | null) => void
	ingredients?: Array<{ name: string; grams: number }>
	instructions?: string
}

export const PortionPanel: FC<PortionPanelProps> = ({
	portion,
	cookedWeight,
	rawTotal,
	discardedFat,
	portionSize,
	effectiveCookedWeight,
	onCookedWeightChange,
	onDiscardedFatChange,
	onPortionSizeChange,
	ingredients,
	instructions
}) => {
	return (
		<div className="rounded-md border border-edge bg-gradient-to-b from-surface-1 to-surface-0 p-4">
			<h3 className="mb-3 text-center font-semibold text-ink-muted text-xs uppercase tracking-wider">
				Per Portion
			</h3>

			<div className="flex flex-col items-center gap-3">
				<MacroRing ratio="macro" macros={portion} size="lg" />

				<div className="grid grid-cols-4 gap-x-6 gap-y-2 lg:grid-cols-2">
					<MacroReadout label="Protein" value={portion.protein} type="protein" />
					<MacroReadout label="Carbs" value={portion.carbs} type="carbs" />
					<MacroReadout label="Fat" value={portion.fat} type="fat" />
					<MacroReadout label="Fiber" value={portion.fiber} type="fiber" />
				</div>

				<div className="my-1 h-px w-full bg-edge" />

				{/* One grid for all three fields — input · unit · action, with labels and hints spanning
				    the row. Sharing the tracks is what aligns them, and each track sizes itself: the
				    action column collapses in the read-only view, which has no AI button. The children
				    render bare cells into it. */}
				<div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1">
					<CookedWeightInput
						cookedWeight={cookedWeight}
						rawTotal={rawTotal}
						onChange={onCookedWeightChange}
						ingredients={ingredients}
						instructions={instructions}
					/>
					<DiscardedFatInput discardedFat={discardedFat} onChange={onDiscardedFatChange} />
					<PortionSizeInput
						portionSize={portionSize}
						effectiveCookedWeight={effectiveCookedWeight}
						onChange={onPortionSizeChange}
					/>
				</div>
			</div>
		</div>
	)
}
