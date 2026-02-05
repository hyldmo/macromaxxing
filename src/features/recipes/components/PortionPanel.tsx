import type { FC } from 'react'
import type { AbsoluteMacros } from '../utils/macros'
import { CookedWeightInput } from './CookedWeightInput'
import { MacroReadout } from './MacroReadout'
import { MacroRing } from './MacroRing'
import { PortionSizeInput } from './PortionSizeInput'

export interface PortionPanelProps {
	portion: AbsoluteMacros
	cookedWeight: number | null
	rawTotal: number
	portionSize: number
	effectiveCookedWeight: number
	onCookedWeightChange?: (value: number | null) => void
	onPortionSizeChange?: (value: number) => void
}

export const PortionPanel: FC<PortionPanelProps> = ({
	portion,
	cookedWeight,
	rawTotal,
	portionSize,
	effectiveCookedWeight,
	onCookedWeightChange,
	onPortionSizeChange
}) => {
	const portions = effectiveCookedWeight > 0 ? effectiveCookedWeight / portionSize : 0

	return (
		<div className="rounded-[--radius-md] border border-edge bg-gradient-to-b from-surface-1 to-surface-0 p-4">
			<h3 className="mb-3 text-center font-semibold text-ink-muted text-xs uppercase tracking-wider">
				Per Portion
			</h3>

			<div className="flex flex-col items-center gap-3">
				<MacroRing
					protein={portion.protein}
					carbs={portion.carbs}
					fat={portion.fat}
					kcal={portion.kcal}
					size="lg"
				/>

				<div className="grid grid-cols-4 gap-x-6 gap-y-2 lg:grid-cols-2">
					<MacroReadout label="Protein" value={portion.protein} type="protein" />
					<MacroReadout label="Carbs" value={portion.carbs} type="carbs" />
					<MacroReadout label="Fat" value={portion.fat} type="fat" />
					<MacroReadout label="Fiber" value={portion.fiber} type="fiber" />
				</div>

				<div className="my-1 h-px w-full bg-edge" />

				<div className="flex w-full flex-col gap-3">
					<CookedWeightInput
						cookedWeight={cookedWeight}
						rawTotal={rawTotal}
						onChange={onCookedWeightChange}
					/>
					<PortionSizeInput portionSize={portionSize} onChange={onPortionSizeChange} />
					<div className="text-center font-mono text-ink-muted text-sm">
						= <span className="font-bold text-ink">{portions.toFixed(1)}</span> portions
					</div>
				</div>
			</div>
		</div>
	)
}
