import type { Exercise } from '@macromaxxing/db'
import { ArrowLeft } from 'lucide-react'
import { type FC, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, LinkButton, Select, Spinner, TRPCError } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useDocumentTitle } from '~/lib/useDocumentTitle'

const PERIOD_OPTIONS = [
	{ label: '30 days', value: 30 },
	{ label: '60 days', value: 60 },
	{ label: '90 days', value: 90 },
	{ label: '6 months', value: 180 },
	{ label: '1 year', value: 365 }
]

const VOLUME_WEEK_OPTIONS = [
	{ label: '4 weeks', value: 4 },
	{ label: '8 weeks', value: 8 },
	{ label: '12 weeks', value: 12 },
	{ label: '26 weeks', value: 26 }
]

const MUSCLE_LABELS: Record<string, string> = {
	chest: 'Chest',
	upper_back: 'Upper Back',
	lats: 'Lats',
	front_delts: 'Front Delts',
	side_delts: 'Side Delts',
	rear_delts: 'Rear Delts',
	biceps: 'Biceps',
	triceps: 'Triceps',
	forearms: 'Forearms',
	quads: 'Quads',
	hamstrings: 'Hamstrings',
	glutes: 'Glutes',
	calves: 'Calves',
	core: 'Core'
}

export function ProgressionPage() {
	useDocumentTitle('Progression')
	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const [selectedExerciseId, setSelectedExerciseId] = useState<Exercise['id'] | ''>('')
	const [days, setDays] = useState(90)
	const [volumeWeeks, setVolumeWeeks] = useState(12)

	// Build exercise options from sessions that actually have data
	const exerciseOptions = useMemo(() => {
		if (!exercisesQuery.data) return []
		return exercisesQuery.data
			.map(e => ({ label: e.name, value: e.id }))
			.sort((a, b) => a.label.localeCompare(b.label))
	}, [exercisesQuery.data])

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<LinkButton to="/workouts" variant="ghost" className="p-1">
					<ArrowLeft className="size-4" />
				</LinkButton>
				<h1 className="font-semibold text-ink">Progression</h1>
			</div>

			{/* 1RM Trend Section */}
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="font-medium text-ink text-sm">Estimated 1RM Trend</h2>
						<div className="ml-auto flex items-center gap-2">
							{exercisesQuery.isLoading ? (
								<Spinner className="size-4" />
							) : (
								<Select
									value={selectedExerciseId}
									options={[
										{ label: 'Select exercise…', value: '' as Exercise['id'] },
										...exerciseOptions
									]}
									onChange={setSelectedExerciseId}
									className="w-48"
								/>
							)}
							<Select
								value={days}
								options={PERIOD_OPTIONS}
								onChange={v => setDays(Number(v))}
								className="w-28"
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{selectedExerciseId ? (
						<E1RMChart exerciseId={selectedExerciseId} days={days} />
					) : (
						<div className="py-8 text-center text-ink-faint text-sm">
							Select an exercise to view its 1RM progression
						</div>
					)}
				</CardContent>
			</Card>

			{/* Volume Over Time Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-3">
						<h2 className="font-medium text-ink text-sm">Weekly Volume by Muscle Group</h2>
						<div className="ml-auto">
							<Select
								value={volumeWeeks}
								options={VOLUME_WEEK_OPTIONS}
								onChange={v => setVolumeWeeks(Number(v))}
								className="w-28"
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<VolumeChart weeks={volumeWeeks} />
				</CardContent>
			</Card>
		</div>
	)
}

// ─── E1RM Chart ──────────────────────────────────────────────────

interface E1RMChartProps {
	exerciseId: Exercise['id']
	days: number
}

const E1RMChart: FC<E1RMChartProps> = ({ exerciseId, days }) => {
	const query = trpc.workout.exerciseProgression.useQuery({ exerciseId, days })
	const [hovered, setHovered] = useState<number | null>(null)
	const svgRef = useRef<SVGSVGElement>(null)

	if (query.isLoading)
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		)
	if (query.error) return <TRPCError error={query.error} />

	const data = query.data
	if (!data || data.length === 0) {
		return (
			<div className="py-8 text-center text-ink-faint text-sm">
				No sessions found for this exercise in the selected period
			</div>
		)
	}

	const W = 600
	const H = 220
	const PAD = { top: 16, right: 16, bottom: 28, left: 48 }
	const plotW = W - PAD.left - PAD.right
	const plotH = H - PAD.top - PAD.bottom

	const e1rms = data.map(d => d.bestE1RM)
	const minY = Math.floor(Math.min(...e1rms) * 0.9)
	const maxY = Math.ceil(Math.max(...e1rms) * 1.05)
	const rangeY = maxY - minY || 1
	const minX = data[0].date
	const maxX = data[data.length - 1].date
	const rangeX = maxX - minX || 1

	const toX = (ts: number) => PAD.left + ((ts - minX) / rangeX) * plotW
	const toY = (val: number) => PAD.top + plotH - ((val - minY) / rangeY) * plotH

	const points = data.map(d => ({ x: toX(d.date), y: toY(d.bestE1RM) }))
	const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
	const areaPath = `${linePath} L${points[points.length - 1].x},${PAD.top + plotH} L${points[0].x},${PAD.top + plotH} Z`

	// Y-axis ticks
	const yTickCount = 5
	const yTicks = Array.from({ length: yTickCount }, (_, i) => minY + (rangeY * i) / (yTickCount - 1))

	// X-axis: date labels
	const xLabelCount = Math.min(data.length, 6)
	const xStep = Math.max(1, Math.floor(data.length / xLabelCount))
	const xLabels = data.filter((_, i) => i % xStep === 0 || i === data.length - 1)

	const hoveredPoint = hovered !== null ? data[hovered] : null

	function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
		const svg = svgRef.current
		if (!svg) return
		const rect = svg.getBoundingClientRect()
		const svgX = ((e.clientX - rect.left) / rect.width) * W
		let closest = 0
		let closestDist = Number.POSITIVE_INFINITY
		for (let i = 0; i < points.length; i++) {
			const dist = Math.abs(points[i].x - svgX)
			if (dist < closestDist) {
				closestDist = dist
				closest = i
			}
		}
		setHovered(closestDist < 30 ? closest : null)
	}

	return (
		<div className="relative">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label="Estimated 1RM progression chart"
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHovered(null)}
			>
				{/* Grid lines */}
				{yTicks.map(tick => (
					<line
						key={tick}
						x1={PAD.left}
						y1={toY(tick)}
						x2={W - PAD.right}
						y2={toY(tick)}
						className="stroke-edge"
						strokeWidth={0.5}
					/>
				))}

				{/* Y-axis labels */}
				{yTicks.map(tick => (
					<text
						key={tick}
						x={PAD.left - 6}
						y={toY(tick)}
						textAnchor="end"
						dominantBaseline="middle"
						className="fill-ink-muted font-mono text-[10px]"
					>
						{Math.round(tick)}
					</text>
				))}

				{/* X-axis labels */}
				{xLabels.map(d => (
					<text
						key={d.date}
						x={toX(d.date)}
						y={H - 4}
						textAnchor="middle"
						className="fill-ink-muted font-mono text-[10px]"
					>
						{formatShortDate(d.date)}
					</text>
				))}

				{/* Area fill */}
				<path d={areaPath} className="fill-accent/10" />

				{/* Line */}
				<path d={linePath} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />

				{/* Data points */}
				{points.map((p, i) => (
					<circle
						key={data[i].sessionId}
						cx={p.x}
						cy={p.y}
						r={hovered === i ? 5 : 3}
						className={hovered === i ? 'fill-accent' : 'fill-accent/70'}
					/>
				))}
			</svg>

			{/* Tooltip */}
			{hoveredPoint && hovered !== null && (
				<div
					className="pointer-events-none absolute z-10 rounded-sm border border-edge bg-surface-1 px-2.5 py-1.5"
					style={{
						left: `${(points[hovered].x / W) * 100}%`,
						top: `${(points[hovered].y / H) * 100}%`,
						transform: 'translate(-50%, -120%)'
					}}
				>
					<div className="font-mono text-[11px] text-ink tabular-nums">
						<span className="text-accent">{hoveredPoint.bestE1RM} kg</span> e1RM
					</div>
					<div className="font-mono text-[10px] text-ink-muted tabular-nums">
						{hoveredPoint.bestWeight} kg × {hoveredPoint.bestReps} · {hoveredPoint.totalSets} sets ·{' '}
						{(hoveredPoint.totalVolume / 1000).toFixed(1)}k vol
					</div>
					<div className="text-[10px] text-ink-faint">{formatLongDate(hoveredPoint.date)}</div>
				</div>
			)}

			{/* Summary stats */}
			{data.length >= 2 && <E1RMSummary data={data} />}
		</div>
	)
}

interface E1RMSummaryProps {
	data: Array<{ bestE1RM: number; date: number }>
}

const E1RMSummary: FC<E1RMSummaryProps> = ({ data }) => {
	const first = data[0].bestE1RM
	const last = data[data.length - 1].bestE1RM
	const change = last - first
	const pct = first > 0 ? (change / first) * 100 : 0
	const best = Math.max(...data.map(d => d.bestE1RM))

	return (
		<div className="mt-3 flex gap-4 border-edge border-t pt-3">
			<StatPill label="Current" value={`${last} kg`} />
			<StatPill label="Peak" value={`${best} kg`} />
			<StatPill
				label="Change"
				value={`${change >= 0 ? '+' : ''}${change.toFixed(1)} kg (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
				className={change >= 0 ? 'text-macro-protein' : 'text-macro-kcal'}
			/>
		</div>
	)
}

interface StatPillProps {
	label: string
	value: string
	className?: string
}

const StatPill: FC<StatPillProps> = ({ label, value, className }) => (
	<div>
		<div className="text-[10px] text-ink-faint uppercase tracking-wider">{label}</div>
		<div className={`font-mono text-sm tabular-nums ${className ?? 'text-ink'}`}>{value}</div>
	</div>
)

// ─── Volume Chart ────────────────────────────────────────────────

interface VolumeChartProps {
	weeks: number
}

// Predefined colors for muscle groups (cycle through macro colors)
const MUSCLE_COLORS: Record<string, string> = {
	chest: 'var(--color-macro-protein)',
	upper_back: 'var(--color-macro-carbs)',
	lats: 'var(--color-macro-fat)',
	front_delts: 'var(--color-accent)',
	side_delts: 'var(--color-macro-kcal)',
	rear_delts: 'var(--color-macro-fiber)',
	biceps: 'var(--color-macro-protein)',
	triceps: 'var(--color-macro-carbs)',
	forearms: 'var(--color-macro-fat)',
	quads: 'var(--color-accent)',
	hamstrings: 'var(--color-macro-kcal)',
	glutes: 'var(--color-macro-fiber)',
	calves: 'var(--color-macro-protein)',
	core: 'var(--color-macro-carbs)'
}

const VolumeChart: FC<VolumeChartProps> = ({ weeks }) => {
	const query = trpc.workout.volumeProgression.useQuery({ weeks })
	const [hoveredWeek, setHoveredWeek] = useState<number | null>(null)
	const svgRef = useRef<SVGSVGElement>(null)

	if (query.isLoading)
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		)
	if (query.error) return <TRPCError error={query.error} />

	const data = query.data
	if (!data || data.length === 0) {
		return (
			<div className="py-8 text-center text-ink-faint text-sm">
				No workout sessions found in the selected period
			</div>
		)
	}

	// Sum total volume per week for the bar chart
	const weekTotals = data.map(d => {
		const total = Object.values(d.muscles).reduce((sum, v) => sum + v, 0)
		return { weekStart: d.weekStart, total, muscles: d.muscles }
	})

	const maxTotal = Math.max(...weekTotals.map(w => w.total), 1)

	const W = 600
	const H = 200
	const PAD = { top: 12, right: 16, bottom: 28, left: 48 }
	const plotW = W - PAD.left - PAD.right
	const plotH = H - PAD.top - PAD.bottom

	const barW = Math.min(40, (plotW / weekTotals.length) * 0.7)
	const gap = (plotW - barW * weekTotals.length) / Math.max(weekTotals.length - 1, 1)

	// Y-axis ticks
	const yTickCount = 4
	const yTicks = Array.from({ length: yTickCount }, (_, i) => (maxTotal * i) / (yTickCount - 1))

	const toY = (val: number) => PAD.top + plotH - (val / maxTotal) * plotH

	const hoveredData = hoveredWeek !== null ? weekTotals[hoveredWeek] : null

	function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
		const svg = svgRef.current
		if (!svg) return
		const rect = svg.getBoundingClientRect()
		const svgX = ((e.clientX - rect.left) / rect.width) * W
		for (let i = 0; i < weekTotals.length; i++) {
			const barX = PAD.left + i * (barW + gap)
			if (svgX >= barX && svgX <= barX + barW) {
				setHoveredWeek(i)
				return
			}
		}
		setHoveredWeek(null)
	}

	return (
		<div className="relative">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label="Weekly muscle volume chart"
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHoveredWeek(null)}
			>
				{/* Grid lines */}
				{yTicks.map(tick => (
					<line
						key={tick}
						x1={PAD.left}
						y1={toY(tick)}
						x2={W - PAD.right}
						y2={toY(tick)}
						className="stroke-edge"
						strokeWidth={0.5}
					/>
				))}

				{/* Y-axis labels */}
				{yTicks.map(tick => (
					<text
						key={tick}
						x={PAD.left - 6}
						y={toY(tick)}
						textAnchor="end"
						dominantBaseline="middle"
						className="fill-ink-muted font-mono text-[10px]"
					>
						{tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : Math.round(tick)}
					</text>
				))}

				{/* Bars — stacked by muscle group */}
				{weekTotals.map((week, i) => {
					const x = PAD.left + i * (barW + gap)
					let cumY = 0

					// Get active muscles sorted by volume desc
					const activeMuscles = Object.entries(week.muscles)
						.filter(([, v]) => v > 0)
						.sort(([, a], [, b]) => b - a)

					return (
						<g key={week.weekStart}>
							{activeMuscles.map(([muscle, vol]) => {
								const barH = (vol / maxTotal) * plotH
								const y = PAD.top + plotH - cumY - barH
								cumY += barH
								return (
									<rect
										key={muscle}
										x={x}
										y={y}
										width={barW}
										height={Math.max(barH, 0.5)}
										fill={MUSCLE_COLORS[muscle] ?? 'var(--color-ink-muted)'}
										opacity={hoveredWeek === i ? 1 : 0.75}
										rx={1}
									/>
								)
							})}
							{/* X label */}
							<text
								x={x + barW / 2}
								y={H - 4}
								textAnchor="middle"
								className="fill-ink-muted font-mono text-[10px]"
							>
								{formatWeekLabel(week.weekStart)}
							</text>
						</g>
					)
				})}
			</svg>

			{/* Tooltip for hovered week */}
			{hoveredData && hoveredWeek !== null && (
				<div
					className="pointer-events-none absolute z-10 min-w-44 rounded-sm border border-edge bg-surface-1 px-2.5 py-1.5"
					style={{
						left: `${((PAD.left + hoveredWeek * (barW + gap) + barW / 2) / W) * 100}%`,
						top: 0,
						transform: 'translate(-50%, 0)'
					}}
				>
					<div className="mb-1 text-[11px] text-ink">Week of {formatLongDate(hoveredData.weekStart)}</div>
					<div className="mb-1 font-mono text-[11px] text-ink tabular-nums">
						{(hoveredData.total / 1000).toFixed(1)}k total volume
					</div>
					<div className="space-y-0.5">
						{Object.entries(hoveredData.muscles)
							.filter(([, v]) => v > 0)
							.sort(([, a], [, b]) => b - a)
							.slice(0, 5)
							.map(([muscle, vol]) => (
								<div
									key={muscle}
									className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums"
								>
									<span
										className="inline-block size-2 rounded-full"
										style={{ backgroundColor: MUSCLE_COLORS[muscle] }}
									/>
									<span className="text-ink-muted">{MUSCLE_LABELS[muscle] ?? muscle}</span>
									<span className="ml-auto text-ink">{(vol / 1000).toFixed(1)}k</span>
								</div>
							))}
					</div>
				</div>
			)}
		</div>
	)
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatShortDate(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatLongDate(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekLabel(ts: number): string {
	const d = new Date(ts)
	return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
