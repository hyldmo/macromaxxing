import { MUSCLE_GROUPS, type MuscleGroup } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { type FC, type MouseEvent, useMemo, useRef, useState } from 'react'
import type { RouterOutput } from '~/lib/trpc'

type WeekRow = RouterOutput['analytics']['weeklyVolumeByMuscle'][number]

export interface WeeklyVolumeChartProps {
	data: WeekRow[]
}

// Hue-rotated palette so 14 muscle groups stay visually distinct in the stack.
// Lightness/chroma kept constant so no muscle visually dominates by saturation.
const MUSCLE_COLORS: Record<MuscleGroup, string> = (() => {
	const map = {} as Record<MuscleGroup, string>
	const step = 360 / MUSCLE_GROUPS.length
	MUSCLE_GROUPS.forEach((mg, i) => {
		map[mg] = `oklch(0.7 0.13 ${Math.round(i * step)})`
	})
	return map
})()

const CHART_HEIGHT = 180
const PADDING_TOP = 8
const PADDING_BOTTOM = 24
const PADDING_LEFT = 36
const PADDING_RIGHT = 8

const TOP_N_TOOLTIP = 5

function formatWeekLabel(weekStart: string): string {
	const d = new Date(`${weekStart}T00:00:00Z`)
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

function formatVolume(kg: number): string {
	if (kg >= 10_000) return `${(kg / 1000).toFixed(0)}t`
	if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
	return `${Math.round(kg)}kg`
}

export const WeeklyVolumeChart: FC<WeeklyVolumeChartProps> = ({ data }) => {
	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
	const svgRef = useRef<SVGSVGElement>(null)

	const { yMax, presentMuscles } = useMemo(() => {
		let max = 0
		const present = new Set<MuscleGroup>()
		for (const week of data) {
			if (week.totalVolume > max) max = week.totalVolume
			for (const mg of MUSCLE_GROUPS) {
				if ((week.volumes[mg] ?? 0) > 0) present.add(mg)
			}
		}
		// Padding so the tallest bar doesn't touch the top edge.
		return { yMax: max > 0 ? max * 1.1 : 1, presentMuscles: present }
	}, [data])

	const totalVolumeAcrossWindow = useMemo(() => data.reduce((sum, w) => sum + w.totalVolume, 0), [data])

	if (data.length === 0 || totalVolumeAcrossWindow === 0) {
		return <div className="py-6 text-center text-ink-faint text-sm">No working sets logged in this window yet</div>
	}

	const chartWidth = 600
	const innerWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT
	const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM
	const barGap = 2
	const barWidth = Math.max(1, innerWidth / data.length - barGap)

	const xForIndex = (i: number) => PADDING_LEFT + i * (barWidth + barGap)
	const yForValue = (v: number) => PADDING_TOP + innerHeight - (v / yMax) * innerHeight

	const yTicks = [0, yMax / 2, yMax]

	const hoveredWeek = hoveredIdx !== null ? data[hoveredIdx] : null
	const hoveredTopMuscles = hoveredWeek
		? MUSCLE_GROUPS.map(mg => ({ mg, volume: hoveredWeek.volumes[mg] ?? 0 }))
				.filter(row => row.volume > 0)
				.sort((a, b) => b.volume - a.volume)
				.slice(0, TOP_N_TOOLTIP)
		: []

	// X-axis tick stride: aim for ~6 labels regardless of window length.
	const tickStride = Math.max(1, Math.ceil(data.length / 6))

	// Track hover on the SVG itself rather than per-bar so we don't need to
	// hang onMouse* on individual <rect> nodes (Biome's a11y rules flag those
	// as static interactive elements).
	const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
		const svg = svgRef.current
		if (!svg) return
		const rect = svg.getBoundingClientRect()
		const xRatio = (e.clientX - rect.left) / rect.width
		const xInChart = xRatio * chartWidth - PADDING_LEFT
		if (xInChart < 0 || xInChart > innerWidth) {
			setHoveredIdx(null)
			return
		}
		const idx = Math.floor(xInChart / (barWidth + barGap))
		if (idx >= 0 && idx < data.length) setHoveredIdx(idx)
		else setHoveredIdx(null)
	}

	return (
		<div className="space-y-3">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
				preserveAspectRatio="none"
				className="block h-44 w-full"
				role="img"
				aria-label="Weekly working-set volume by muscle group"
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHoveredIdx(null)}
			>
				<title>Weekly working-set volume by muscle group</title>

				{/* Y-axis grid + labels */}
				{yTicks.map(t => (
					<g key={t}>
						<line
							x1={PADDING_LEFT}
							x2={chartWidth - PADDING_RIGHT}
							y1={yForValue(t)}
							y2={yForValue(t)}
							stroke="var(--color-edge)"
							strokeDasharray="2 2"
						/>
						<text
							x={PADDING_LEFT - 4}
							y={yForValue(t)}
							textAnchor="end"
							dominantBaseline="middle"
							className="fill-ink-faint font-mono text-[9px] tabular-nums"
						>
							{formatVolume(t)}
						</text>
					</g>
				))}

				{/* Stacked bars */}
				{data.map((week, i) => {
					const x = xForIndex(i)
					let runningTop = yForValue(0)
					return (
						<g key={week.weekStart}>
							{MUSCLE_GROUPS.map(mg => {
								const v = week.volumes[mg] ?? 0
								if (v <= 0) return null
								const segHeight = (v / yMax) * innerHeight
								const segY = runningTop - segHeight
								runningTop = segY
								return (
									<rect
										key={mg}
										x={x}
										y={segY}
										width={barWidth}
										height={segHeight}
										fill={MUSCLE_COLORS[mg]}
										opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.45}
									/>
								)
							})}
						</g>
					)
				})}

				{/* X-axis labels */}
				{data.map((week, i) => {
					if (i % tickStride !== 0 && i !== data.length - 1) return null
					return (
						<text
							key={week.weekStart}
							x={xForIndex(i) + barWidth / 2}
							y={CHART_HEIGHT - 8}
							textAnchor="middle"
							className="fill-ink-faint font-mono text-[9px] tabular-nums"
						>
							{formatWeekLabel(week.weekStart)}
						</text>
					)
				})}
			</svg>

			{/* Tooltip / readout */}
			<div className="min-h-[60px] rounded-sm border border-edge bg-surface-0 p-2">
				{hoveredWeek ? (
					<div className="space-y-1">
						<div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
							<span className="text-ink">Week of {formatWeekLabel(hoveredWeek.weekStart)}</span>
							<span className="text-ink-muted">{formatVolume(hoveredWeek.totalVolume)} total</span>
						</div>
						{hoveredTopMuscles.length === 0 ? (
							<div className="text-ink-faint text-xs">No volume this week</div>
						) : (
							<div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
								{hoveredTopMuscles.map(({ mg, volume }) => (
									<div
										key={mg}
										className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums"
									>
										<span
											aria-hidden
											className="inline-block size-2 rounded-sm"
											style={{ backgroundColor: MUSCLE_COLORS[mg] }}
										/>
										<span className="truncate text-ink">{startCase(mg)}</span>
										<span className="text-ink-faint">{formatVolume(volume)}</span>
									</div>
								))}
							</div>
						)}
					</div>
				) : (
					<div className="text-ink-faint text-xs">Hover a bar to see the muscle breakdown</div>
				)}
			</div>

			{/* Legend (only muscles that appeared in the window) */}
			<div className="flex flex-wrap gap-x-3 gap-y-1">
				{MUSCLE_GROUPS.filter(mg => presentMuscles.has(mg)).map(mg => (
					<div key={mg} className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
						<span
							aria-hidden
							className="inline-block size-2 rounded-sm"
							style={{ backgroundColor: MUSCLE_COLORS[mg] }}
						/>
						<span className="text-ink-muted">{startCase(mg)}</span>
					</div>
				))}
			</div>
		</div>
	)
}
