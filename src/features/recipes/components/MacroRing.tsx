import type { AbsoluteMacros } from '@macromaxxing/db'
import type { FC } from 'react'
import { isPresent } from 'ts-extras'
import { cn } from '~/lib'
import { caloricRatio, macroRatio } from '../utils/macros'

type MacroRingSize = 'sm' | 'md' | 'lg'

export interface MacroRingProps {
	className?: string
	macros: Pick<AbsoluteMacros, 'protein' | 'carbs' | 'fat' | 'kcal' | 'fiber'>
	size?: MacroRingSize
	ratio?: 'caloric' | 'macro'
}

const sizeConfig = {
	sm: { px: 48, stroke: 5, fontSize: 'text-[10px]' },
	md: { px: 80, stroke: 7, fontSize: 'text-sm' },
	lg: { px: 120, stroke: 9, fontSize: 'text-xl' }
} as const

export const MacroRing: FC<MacroRingProps> = ({ className, macros, ratio: ratioType = 'caloric', size = 'md' }) => {
	const { px, stroke, fontSize } = sizeConfig[size]
	const radius = (px - stroke) / 2
	const circumference = 2 * Math.PI * radius
	// Split to avoid `in` narrowing bug with extended interfaces: https://github.com/microsoft/TypeScript/issues/56106
	const mRatio = ratioType === 'macro' ? macroRatio(macros) : null
	const ratio = mRatio ?? caloricRatio(macros)
	const center = px / 2

	const segments = [
		{ key: 'protein', ratio: ratio.protein, color: 'var(--color-macro-protein)' },
		{ key: 'carbs', ratio: ratio.carbs, color: 'var(--color-macro-carbs)' },
		{ key: 'fat', ratio: ratio.fat, color: 'var(--color-macro-fat)' },
		mRatio ? { key: 'fiber', ratio: mRatio.fiber, color: 'var(--color-macro-fiber)' } : null
	].filter(isPresent)

	let accumulatedOffset = 0

	return (
		<svg
			width={px}
			height={px}
			className={cn('shrink-0 -rotate-90', className)}
			role="img"
			aria-label="Macro caloric ratio"
		>
			{ratio.total === 0 ? (
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke="var(--color-surface-2)"
					strokeWidth={stroke}
				/>
			) : (
				segments.map((seg, _i) => {
					if (seg.ratio === 0) return null
					const dashLength = seg.ratio * circumference
					const gap = circumference - dashLength
					const offset = -accumulatedOffset
					accumulatedOffset += dashLength
					return (
						<circle
							key={seg.key}
							cx={center}
							cy={center}
							r={radius}
							fill="none"
							stroke={seg.color}
							strokeWidth={stroke}
							strokeDasharray={`${dashLength} ${gap}`}
							strokeDashoffset={offset}
							strokeLinecap="butt"
							className="transition-all duration-500"
						/>
					)
				})
			)}
			<text
				x={center}
				y={center}
				textAnchor="middle"
				dominantBaseline="central"
				className={`${fontSize} origin-center rotate-90 fill-ink font-bold font-mono`}
			>
				{macros.kcal.toFixed(0)}
			</text>
		</svg>
	)
}
