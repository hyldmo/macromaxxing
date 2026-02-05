import type { FC } from 'react'
import { caloricRatio } from '../utils/macros'

type MacroRingSize = 'sm' | 'md' | 'lg'

export interface MacroRingProps {
	protein: number
	carbs: number
	fat: number
	kcal: number
	size?: MacroRingSize
}

const sizeConfig = {
	sm: { px: 48, stroke: 5, fontSize: 'text-[10px]' },
	md: { px: 80, stroke: 7, fontSize: 'text-sm' },
	lg: { px: 120, stroke: 9, fontSize: 'text-xl' }
} as const

export const MacroRing: FC<MacroRingProps> = ({ protein, carbs, fat, kcal, size = 'md' }) => {
	const { px, stroke, fontSize } = sizeConfig[size]
	const radius = (px - stroke) / 2
	const circumference = 2 * Math.PI * radius
	const ratio = caloricRatio(protein, carbs, fat)
	const total = ratio.protein + ratio.carbs + ratio.fat
	const center = px / 2

	const segments = [
		{ key: 'protein', ratio: ratio.protein, color: 'var(--color-macro-protein)' },
		{ key: 'carbs', ratio: ratio.carbs, color: 'var(--color-macro-carbs)' },
		{ key: 'fat', ratio: ratio.fat, color: 'var(--color-macro-fat)' }
	]

	let accumulatedOffset = 0

	return (
		<svg width={px} height={px} className="shrink-0 -rotate-90" role="img" aria-label="Macro caloric ratio">
			{total === 0 ? (
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
				{kcal.toFixed(0)}
			</text>
		</svg>
	)
}
