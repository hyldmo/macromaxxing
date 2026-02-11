import type { SetType } from '@macromaxxing/db'
import type { FC, ReactNode } from 'react'
import { cn } from '~/lib/cn'

const SET_TYPE_COLORS: Record<SetType, string> = {
	warmup: 'var(--color-macro-carbs)',
	working: 'var(--color-macro-protein)',
	backoff: 'var(--color-macro-fat)'
}

export interface TimerRingProps {
	remaining: number
	total: number
	setType: SetType
	children?: ReactNode
}

export const TimerRing: FC<TimerRingProps> = ({ remaining, total, setType, children }) => {
	const size = 320
	const stroke = 16
	const center = size / 2
	const radius = (size - stroke) / 2
	const circumference = 2 * Math.PI * radius

	const overshot = remaining <= 0
	const progress = total > 0 ? Math.max(0, remaining / total) : 0
	const dashLength = progress * circumference
	const gap = circumference - dashLength

	const ringColor = overshot ? 'var(--color-destructive)' : SET_TYPE_COLORS[setType]

	// Tick marks sit on the ring itself
	const tickInner = radius - stroke / 2
	const tickOuter = radius + stroke / 2

	return (
		<div className={cn('relative mx-auto', overshot && 'animate-pulse')} style={{ width: size, height: size }}>
			<svg width={size} height={size} className="absolute inset-0 -rotate-90" role="img" aria-label="Rest timer">
				{/* Background ring */}
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke="var(--color-surface-2)"
					strokeWidth={stroke}
				/>

				{/* Progress ring */}
				<circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke={ringColor}
					strokeWidth={stroke}
					strokeDasharray={`${dashLength} ${gap}`}
					strokeLinecap="butt"
					className="transition-[stroke] duration-300"
				/>

				{/* 60 tick marks on top of the ring */}
				{Array.from({ length: 60 }, (_, i) => {
					const angle = (i / 60) * 360
					const rad = (angle * Math.PI) / 180
					const isMajor = i % 5 === 0
					const inner = isMajor ? tickInner - 2 : tickInner + 3
					const outer = isMajor ? tickOuter + 2 : tickOuter - 3
					return (
						<line
							key={angle}
							x1={center + inner * Math.cos(rad)}
							y1={center + inner * Math.sin(rad)}
							x2={center + outer * Math.cos(rad)}
							y2={center + outer * Math.sin(rad)}
							stroke="var(--color-surface-0)"
							strokeWidth={isMajor ? 2.5 : 1}
							opacity={isMajor ? 1 : 0.6}
						/>
					)
				})}
			</svg>

			{/* Center content (HTML for better text rendering) */}
			<div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
		</div>
	)
}
