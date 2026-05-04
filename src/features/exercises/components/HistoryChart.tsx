import type { FC } from 'react'
import { formatTickDate, linearScale, pickTickIndices } from '~/lib/chart/scale'
import { cn } from '~/lib/cn'

export interface HistoryChartDatum {
	sessionId: string
	startedAt: number // unix epoch ms
	e1rm: number // 0 for bodyweight-only sessions
	topSet: { weightKg: number; reps: number; rpe: number | null }
	volume: number // kg·reps
}

export type HistoryChartMetric = 'e1rm' | 'volume' | 'weight'

export interface HistoryChartProps {
	data: HistoryChartDatum[]
	metric?: HistoryChartMetric
	className?: string
}

const VIEW_W = 640
const VIEW_H = 360
const PAD_LEFT = 56
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 36
const PLOT_LEFT = PAD_LEFT
const PLOT_RIGHT = VIEW_W - PAD_RIGHT
const PLOT_TOP = PAD_TOP
const PLOT_BOTTOM = VIEW_H - PAD_BOTTOM
const Y_GRID_LINES = 4 // min, max, plus 2 between

const METRIC_LABEL: Record<HistoryChartMetric, string> = {
	e1rm: 'e1RM',
	volume: 'Volume',
	weight: 'Top set'
}

const METRIC_UNIT: Record<HistoryChartMetric, string> = {
	e1rm: 'kg',
	volume: 'kg·reps',
	weight: 'kg'
}

function getMetricValue(d: HistoryChartDatum, metric: HistoryChartMetric): number {
	switch (metric) {
		case 'e1rm':
			return d.e1rm
		case 'volume':
			return d.volume
		case 'weight':
			return d.topSet.weightKg
	}
}

function formatNumber(n: number): string {
	// Compact display: drop trailing zeros for whole-ish numbers.
	if (Number.isFinite(n) === false) return '–'
	if (Math.abs(n) >= 100) return n.toFixed(0)
	if (Math.abs(n) >= 10) return n.toFixed(1).replace(/\.0$/, '')
	return n.toFixed(2).replace(/\.?0+$/, '')
}

function formatFullDate(ts: number): string {
	return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ts))
}

export const HistoryChart: FC<HistoryChartProps> = ({ data, metric = 'e1rm', className }) => {
	// Empty state — no SVG with NaN coords.
	if (data.length === 0) {
		return (
			<div
				className={cn(
					'flex aspect-[16/9] w-full items-center justify-center border border-edge bg-surface-1 text-ink-faint text-sm',
					className
				)}
			>
				No sessions logged for this exercise yet
			</div>
		)
	}

	// Auto-switch e1rm → volume only when caller defaulted/explicitly chose 'e1rm' AND every entry is zero
	// (bodyweight-only). Caller passing 'volume' or 'weight' suppresses the switch.
	const isAllZeroE1rm = metric === 'e1rm' && data.every(d => d.e1rm === 0)
	const effectiveMetric: HistoryChartMetric = isAllZeroE1rm ? 'volume' : metric

	const sorted = [...data].sort((a, b) => a.startedAt - b.startedAt)
	const timestamps = sorted.map(d => d.startedAt)
	const values = sorted.map(d => getMetricValue(d, effectiveMetric))

	const xMin = timestamps[0]
	const xMax = timestamps[timestamps.length - 1]
	const yRaw = Math.max(...values)
	const yMinRaw = Math.min(...values)
	// Pad y-range slightly so dots at the extremes don't sit on the axis.
	const yPad = yRaw === yMinRaw ? Math.max(1, yRaw * 0.1) : (yRaw - yMinRaw) * 0.1
	const yMax = yRaw + yPad
	const yMin = Math.max(0, yMinRaw - yPad)

	const xFor = (t: number) => linearScale(t, xMin, xMax, PLOT_LEFT, PLOT_RIGHT)
	// SVG y-axis is inverted (0 at top), so swap output bounds.
	const yFor = (v: number) => linearScale(v, yMin, yMax, PLOT_BOTTOM, PLOT_TOP)

	const points = sorted.map(d => ({
		x: xFor(d.startedAt),
		y: yFor(getMetricValue(d, effectiveMetric)),
		datum: d,
		value: getMetricValue(d, effectiveMetric)
	}))

	const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')

	const xTickIndices = pickTickIndices(sorted.length, 6)
	const yTickValues = Array.from({ length: Y_GRID_LINES }, (_, i) => yMin + ((yMax - yMin) * i) / (Y_GRID_LINES - 1))

	const startLabel = formatFullDate(xMin)
	const endLabel = formatFullDate(xMax)
	const ariaLabel = `${METRIC_LABEL[effectiveMetric]} history from ${startLabel} to ${endLabel}: ${sorted.length} session${sorted.length === 1 ? '' : 's'}`

	const isSinglePoint = sorted.length === 1
	const unit = METRIC_UNIT[effectiveMetric]

	return (
		<div className={cn('relative w-full', className)}>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-ink-muted text-xs uppercase tracking-wide">
						{METRIC_LABEL[effectiveMetric]}
					</span>
					<span className="font-mono text-[10px] text-ink-faint">{unit}</span>
				</div>
				{isAllZeroE1rm && <span className="text-ink-faint text-xs">bodyweight</span>}
			</div>

			<svg
				viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
				preserveAspectRatio="none"
				className="block aspect-[16/9] w-full border border-edge bg-surface-1"
				role="img"
				aria-label={ariaLabel}
			>
				<title>{`${METRIC_LABEL[effectiveMetric]} over time`}</title>
				<desc>{ariaLabel}</desc>

				{/* Y-axis grid lines + labels */}
				{yTickValues.map((v, i) => {
					const y = yFor(v)
					const isEdge = i === 0 || i === yTickValues.length - 1
					return (
						<g key={`y-${v}`}>
							<line
								x1={PLOT_LEFT}
								x2={PLOT_RIGHT}
								y1={y}
								y2={y}
								stroke="var(--color-edge)"
								strokeWidth={1}
								strokeDasharray={isEdge ? undefined : '2 4'}
							/>
							<text
								x={PLOT_LEFT - 8}
								y={y}
								textAnchor="end"
								dominantBaseline="middle"
								fontSize={11}
								fontFamily="var(--font-mono)"
								fill="var(--color-ink-faint)"
								className="tabular-nums"
							>
								{formatNumber(v)}
							</text>
						</g>
					)
				})}

				{/* X-axis baseline */}
				<line
					x1={PLOT_LEFT}
					x2={PLOT_RIGHT}
					y1={PLOT_BOTTOM}
					y2={PLOT_BOTTOM}
					stroke="var(--color-edge)"
					strokeWidth={1}
				/>

				{/* X-axis tick labels */}
				{xTickIndices.map(i => {
					const p = points[i]
					return (
						<text
							key={`x-${p.datum.sessionId}`}
							x={p.x}
							y={PLOT_BOTTOM + 18}
							textAnchor="middle"
							fontSize={11}
							fontFamily="var(--font-mono)"
							fill="var(--color-ink-faint)"
							className="tabular-nums"
						>
							{formatTickDate(p.datum.startedAt, timestamps)}
						</text>
					)
				})}

				{/* Line (skip when single point — would render as a degenerate path) */}
				{isSinglePoint === false && (
					<path
						d={linePath}
						fill="none"
						stroke="var(--color-accent)"
						strokeWidth={2}
						strokeLinejoin="miter"
						strokeLinecap="butt"
					/>
				)}

				{/* Dots */}
				{points.map(p => (
					<circle
						key={p.datum.sessionId}
						cx={p.x}
						cy={p.y}
						r={4}
						fill="var(--color-surface-0)"
						stroke="var(--color-accent)"
						strokeWidth={2}
					>
						<title>
							{`${formatFullDate(p.datum.startedAt)} — ${formatNumber(p.value)} ${unit}` +
								(effectiveMetric !== 'volume'
									? ` (${p.datum.topSet.weightKg}kg × ${p.datum.topSet.reps})`
									: '')}
						</title>
					</circle>
				))}

				{/* Single-point value overlay */}
				{isSinglePoint && (
					<text
						x={points[0].x}
						y={points[0].y - 12}
						textAnchor="middle"
						fontSize={12}
						fontFamily="var(--font-mono)"
						fill="var(--color-ink)"
						className="tabular-nums"
					>
						{`${formatNumber(points[0].value)} ${unit}`}
					</text>
				)}
			</svg>

			{/* Screen-reader-only data table — full transcript of the chart */}
			<table className="sr-only">
				<caption>{ariaLabel}</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">Weight (kg)</th>
						<th scope="col">Reps</th>
						<th scope="col">e1RM</th>
						<th scope="col">Volume</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map(d => (
						<tr key={d.sessionId}>
							<td>{formatFullDate(d.startedAt)}</td>
							<td>{d.topSet.weightKg}</td>
							<td>{d.topSet.reps}</td>
							<td>{d.e1rm}</td>
							<td>{d.volume}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
