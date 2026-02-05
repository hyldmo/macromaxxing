import { startCase } from 'es-toolkit'
import type { FC } from 'react'
import { cn } from '~/lib/cn'

type MacroReadoutType = 'protein' | 'carbs' | 'fat' | 'fiber'

export interface MacroReadoutProps {
	label?: string
	value: number
	unit?: string
	type: MacroReadoutType
}

const colorClass: Record<MacroReadoutType, string> = {
	protein: 'text-macro-protein',
	carbs: 'text-macro-carbs',
	fat: 'text-macro-fat',
	fiber: 'text-macro-fiber'
}

export const MacroReadout: FC<MacroReadoutProps> = ({ label, value, unit = 'g', type }) => {
	return (
		<div className="flex flex-col items-center">
			<span className="text-[10px] text-ink-muted uppercase tracking-wider">{label ?? startCase(type)}</span>
			<span className={cn('font-bold font-mono text-2xl tabular-nums', colorClass[type])}>
				{value.toFixed(1)}
			</span>
			<span className="text-[10px] text-ink-faint">{unit}</span>
		</div>
	)
}
