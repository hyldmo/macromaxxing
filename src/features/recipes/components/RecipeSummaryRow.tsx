import type { FC } from 'react'
import { cn } from '~/lib/cn'
import type { AbsoluteMacros } from '../utils/macros'
import { MacroCell } from './MacroCell'

export interface RecipeSummaryRowProps {
	label: string
	macros: AbsoluteMacros
	className?: string
}

export const RecipeSummaryRow: FC<RecipeSummaryRowProps> = ({ label, macros, className }) => {
	return (
		<tr className={className}>
			<td className="px-2 py-1.5 font-semibold text-ink text-sm">{label}</td>
			<td className={cn('px-2 py-1.5 text-right font-mono font-semibold text-ink-muted text-sm')}>
				{macros.weight.toFixed(0)}g
			</td>
			<MacroCell grams={macros.protein} weight={macros.weight} macro="protein" />
			<MacroCell grams={macros.carbs} weight={macros.weight} macro="carbs" />
			<MacroCell grams={macros.fat} weight={macros.weight} macro="fat" />
			<MacroCell grams={macros.kcal} macro="kcal" />
			<MacroCell grams={macros.fiber} weight={macros.weight} macro="fiber" />
			<td />
		</tr>
	)
}
