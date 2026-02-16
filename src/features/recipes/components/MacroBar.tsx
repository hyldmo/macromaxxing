import type { FC } from 'react'
import type { AbsoluteMacros } from '~/lib/macros'
import { macroRatio } from '../utils/macros'

export interface MacroBarProps {
	macros: Pick<AbsoluteMacros, 'protein' | 'carbs' | 'fat' | 'fiber'>
}

export const MacroBar: FC<MacroBarProps> = ({ macros }) => {
	const ratio = macroRatio(macros)

	if (ratio.total === 0) {
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
			{ratio.fiber > 0 && (
				<div
					className="bg-macro-fiber transition-all duration-300"
					style={{ width: `${ratio.fiber * 100}%` }}
				/>
			)}
		</div>
	)
}
