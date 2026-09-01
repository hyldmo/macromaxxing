import type { FC } from 'react'
import { isPresent } from 'ts-extras'
import { cn } from '~/lib'
import type { MacroType } from '../utils/format'
import { formatMacro } from '../utils/format'
import { macroPercentage } from '../utils/macros'

export type { MacroType } from '../utils/format'

const macroColorClass: Record<MacroType, string> = {
	protein: 'text-macro-protein',
	carbs: 'text-macro-carbs',
	fat: 'text-macro-fat',
	kcal: 'text-macro-kcal',
	fiber: 'text-macro-fiber'
}

export interface MacroCellProps {
	grams: number
	/** Omit weight to calculate percentage */
	weight?: number
	macro: MacroType
	className?: string
}

export const MacroCell: FC<MacroCellProps> = ({ grams, weight, macro, className }) => {
	const pct = weight ? macroPercentage(grams, weight) : undefined
	return (
		<td className={cn('px-2 py-1.5 text-right font-mono text-sm', className)}>
			{isPresent(pct) && <span className="text-ink-faint text-xs">{pct.toFixed(0)}% </span>}
			<span className={cn('font-medium', macroColorClass[macro])}>{formatMacro(grams, macro)}</span>
		</td>
	)
}

export function MacroHeader({ macro, label, className }: { macro: MacroType; label: string; className?: string }) {
	return (
		<th className={cn('px-2 py-1.5 text-right font-medium text-xs', macroColorClass[macro], className)}>{label}</th>
	)
}
