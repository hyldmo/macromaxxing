import { type FC, useMemo } from 'react'
import { cn } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type HeatmapRow = RouterOutput['analytics']['calendarHeatmap'][number]

export interface CalendarHeatmapProps {
	data: HeatmapRow[]
	/** Time window — controls how many weeks to render. */
	weeks: number
}

const DAYS_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Returns ms epoch for the most recent Monday <= ts (UTC). */
function startOfWeekMs(ts: number): number {
	const d = new Date(ts)
	const day = d.getUTCDay() // 0=Sun..6=Sat
	const offset = day === 0 ? 6 : day - 1 // days since Monday
	d.setUTCDate(d.getUTCDate() - offset)
	d.setUTCHours(0, 0, 0, 0)
	return d.getTime()
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function intensityClass(count: number, max: number): string {
	if (count <= 0) return 'bg-surface-2'
	if (max <= 0) return 'bg-surface-2'
	const ratio = count / max
	if (ratio < 0.25) return 'bg-accent/20'
	if (ratio < 0.5) return 'bg-accent/40'
	if (ratio < 0.75) return 'bg-accent/65'
	return 'bg-accent'
}

export const CalendarHeatmap: FC<CalendarHeatmapProps> = ({ data, weeks }) => {
	const { columns, max } = useMemo(() => {
		const byDate = new Map<string, HeatmapRow>()
		for (const row of data) byDate.set(row.date, row)

		const today = Date.now()
		const lastMonday = startOfWeekMs(today)
		const firstMonday = lastMonday - (weeks - 1) * 7 * MS_PER_DAY

		const cols: Array<{ weekStart: number; cells: Array<{ date: string; count: number } | null> }> = []
		let maxCount = 0

		for (let w = 0; w < weeks; w++) {
			const weekStart = firstMonday + w * 7 * MS_PER_DAY
			const cells: Array<{ date: string; count: number } | null> = []
			for (let d = 0; d < 7; d++) {
				const cellMs = weekStart + d * MS_PER_DAY
				if (cellMs > today) {
					cells.push(null)
					continue
				}
				const cellDate = new Date(cellMs)
				const key = `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(
					2,
					'0'
				)}-${String(cellDate.getUTCDate()).padStart(2, '0')}`
				const row = byDate.get(key)
				const count = row?.workingSetCount ?? 0
				if (count > maxCount) maxCount = count
				cells.push({ date: key, count })
			}
			cols.push({ weekStart, cells })
		}

		return { columns: cols, max: maxCount }
	}, [data, weeks])

	if (data.length === 0) {
		return (
			<div className="space-y-3">
				<HeatmapGrid columns={columns} max={max} />
				<div className="text-center text-ink-faint text-xs">No sessions logged in this window yet</div>
			</div>
		)
	}

	return (
		<div className="space-y-3">
			<HeatmapGrid columns={columns} max={max} />
			<div className="flex items-center justify-end gap-2 font-mono text-[10px] text-ink-faint tabular-nums">
				<span>less</span>
				<span className={cn('inline-block size-3 rounded-sm', 'bg-surface-2')} />
				<span className={cn('inline-block size-3 rounded-sm', 'bg-accent/20')} />
				<span className={cn('inline-block size-3 rounded-sm', 'bg-accent/40')} />
				<span className={cn('inline-block size-3 rounded-sm', 'bg-accent/65')} />
				<span className={cn('inline-block size-3 rounded-sm', 'bg-accent')} />
				<span>more</span>
			</div>
		</div>
	)
}

interface HeatmapGridProps {
	columns: Array<{ weekStart: number; cells: Array<{ date: string; count: number } | null> }>
	max: number
}

const HeatmapGrid: FC<HeatmapGridProps> = ({ columns, max }) => (
	<div className="overflow-x-auto">
		<div className="flex gap-1">
			{/* Day-of-week labels column */}
			<div className="flex flex-col gap-1 pr-1 text-[9px] text-ink-faint">
				{DAYS_LABEL.map((label, i) => (
					<div key={label} className="flex h-3 items-center font-mono">
						{i % 2 === 1 ? label : ''}
					</div>
				))}
			</div>
			{columns.map(col => (
				<div key={col.weekStart} className="flex flex-col gap-1">
					{col.cells.map((cell, i) =>
						cell === null ? (
							<div
								key={`empty-${col.weekStart}-${i}`}
								className="size-3 rounded-sm bg-transparent"
								aria-hidden
							/>
						) : (
							<div
								key={cell.date}
								className={cn('size-3 rounded-sm', intensityClass(cell.count, max))}
								title={`${cell.date}: ${cell.count} working set${cell.count === 1 ? '' : 's'}`}
							/>
						)
					)}
				</div>
			))}
		</div>
	</div>
)
