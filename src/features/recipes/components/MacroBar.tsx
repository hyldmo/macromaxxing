import type { FC } from 'react'
import { caloricRatio } from '../utils/macros'

export interface MacroBarProps {
	protein: number
	carbs: number
	fat: number
}

export const MacroBar: FC<MacroBarProps> = ({ protein, carbs, fat }) => {
	const ratio = caloricRatio(protein, carbs, fat)
	const total = ratio.protein + ratio.carbs + ratio.fat

	if (total === 0) {
		return <div className="h-1.5 w-full rounded-full bg-surface-2" />
	}

	return (
		<div className="flex h-1.5 w-full overflow-hidden rounded-full">
			{ratio.protein > 0 && (
				<div
					className="bg-macro-protein transition-all duration-300"
					style={{ width: `${ratio.protein * 100}%` }}
				/>
			)}
			{ratio.carbs > 0 && (
				<div
					className="bg-macro-carbs transition-all duration-300"
					style={{ width: `${ratio.carbs * 100}%` }}
				/>
			)}
			{ratio.fat > 0 && (
				<div className="bg-macro-fat transition-all duration-300" style={{ width: `${ratio.fat * 100}%` }} />
			)}
		</div>
	)
}
