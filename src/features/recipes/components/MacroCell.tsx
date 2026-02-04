import { cn } from '~/lib/cn'
import { macroPercentage } from '../utils/macros'

export type MacroType = 'protein' | 'carbs' | 'fat' | 'kcal' | 'fiber'

const macroColorClass: Record<MacroType, string> = {
	protein: 'text-macro-protein',
	carbs: 'text-macro-carbs',
	fat: 'text-macro-fat',
	kcal: 'text-macro-kcal',
	fiber: 'text-macro-fiber'
}

interface MacroCellProps {
	grams: number
	weight: number
	macro: MacroType
}

export function MacroCell({ grams, weight, macro }: MacroCellProps) {
	const pct = macroPercentage(grams, weight)
	const isKcal = macro === 'kcal'
	return (
		<td className="px-2 py-1.5 text-right font-mono text-sm">
			<span className="text-ink-faint text-xs">{pct.toFixed(0)}%</span>{' '}
			<span className={cn('font-medium', macroColorClass[macro])}>{grams.toFixed(isKcal ? 0 : 1)}</span>
		</td>
	)
}

export function MacroHeader({ macro, label }: { macro: MacroType; label: string }) {
	return <th className={cn('px-2 py-1.5 text-right font-medium text-xs', macroColorClass[macro])}>{label}</th>
}
