import type { FC } from 'react'

// Timer-dial boot splash (mirrors TimerRing). Animations live in index.css
// (.app-loader-*) so the dial renders from the linked stylesheet even before
// the React bundle hydrates.
const SIZE = 140
const STROKE = 20
const CENTER = SIZE / 2
const RADIUS = (SIZE - STROKE) / 2
const MAJOR_COUNT = 6
const TICK_COUNT = MAJOR_COUNT * 3

const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
	const angle = (i / TICK_COUNT) * 360
	const rad = (angle * Math.PI) / 180
	const isMajor = i % (TICK_COUNT / MAJOR_COUNT) === 0
	const inner = isMajor ? RADIUS - STROKE / 2 - 3 : RADIUS - STROKE / 2
	const outer = isMajor ? RADIUS + STROKE / 2 + 3 : RADIUS + STROKE / 2
	return {
		angle,
		isMajor,
		x1: CENTER + inner * Math.cos(rad),
		y1: CENTER + inner * Math.sin(rad),
		x2: CENTER + outer * Math.cos(rad),
		y2: CENTER + outer * Math.sin(rad)
	}
})

export const AppLoader: FC = () => (
	<div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-0">
		<svg width={SIZE} height={SIZE} className="-rotate-90" role="img" aria-label="Loading">
			<circle
				cx={CENTER}
				cy={CENTER}
				r={RADIUS}
				fill="none"
				stroke="var(--color-surface-2)"
				strokeWidth={STROKE}
			/>
			<g className="app-loader-rotor">
				<circle
					className="app-loader-arc"
					cx={CENTER}
					cy={CENTER}
					r={RADIUS}
					fill="none"
					strokeWidth={STROKE}
					strokeLinecap="round"
				/>
			</g>
			{ticks.map(t => (
				<line
					key={t.angle}
					x1={t.x1}
					y1={t.y1}
					x2={t.x2}
					y2={t.y2}
					stroke="var(--color-surface-0)"
					strokeWidth={t.isMajor ? 3 : 1.5}
					opacity={t.isMajor ? 0.8 : 0.4}
				/>
			))}
		</svg>
		<div className="font-display text-ink-faint text-lg">Macromaxxing</div>
	</div>
)
