import type { FC } from 'react'
import { Link } from 'react-router'
import { formatDate } from '~/lib/date'
import type { RouterOutput } from '~/lib/trpc'
import { METRIC_LABEL, METRIC_UNIT } from '~/lib/workouts/constants'

type HistoryEntry = RouterOutput['workout']['exerciseHistory'][number]

export interface HistoryTableProps {
	data: HistoryEntry[]
}

function formatNumber(n: number, digits = 1): string {
	if (!Number.isFinite(n)) return '–'
	const rounded = n.toFixed(digits)
	return rounded.replace(/\.?0+$/, '')
}

function formatTopSet(top: HistoryEntry['topSet']): string {
	if (top.weightKg <= 0 && top.reps <= 0) return '—'
	return `${formatNumber(top.weightKg)}${METRIC_UNIT.weight} × ${top.reps}`
}

export const HistoryTable: FC<HistoryTableProps> = ({ data }) => {
	if (data.length === 0) return null

	// Newest first for the readout — chart already shows oldest→newest.
	const sorted = [...data].sort((a, b) => b.startedAt - a.startedAt)

	return (
		<>
			{/* Mobile: card list */}
			<ul className="space-y-2 md:hidden">
				{sorted.map(entry => (
					<li key={entry.sessionId}>
						<Link
							to={`/workouts/sessions/${entry.sessionId}`}
							className="block rounded-md border border-edge bg-surface-1 px-3 py-2 hover:bg-surface-2"
						>
							<div className="flex items-baseline justify-between gap-2">
								<span className="font-medium text-ink text-sm">{formatDate(entry.startedAt)}</span>
								<span className="font-mono text-ink-muted text-xs tabular-nums">
									{entry.workingSetCount} {entry.workingSetCount === 1 ? 'set' : 'sets'}
								</span>
							</div>
							<div className="mt-1 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
								<div>
									<div className="text-[10px] text-ink-faint uppercase tracking-wide">
										{METRIC_LABEL.weight}
									</div>
									<div className="text-ink">{formatTopSet(entry.topSet)}</div>
								</div>
								<div>
									<div className="text-[10px] text-ink-faint uppercase tracking-wide">
										{METRIC_LABEL.e1rm}
									</div>
									<div className="text-ink">
										{entry.e1rm > 0 ? `${formatNumber(entry.e1rm)}${METRIC_UNIT.e1rm}` : '—'}
									</div>
								</div>
								<div>
									<div className="text-[10px] text-ink-faint uppercase tracking-wide">
										{METRIC_LABEL.volume}
									</div>
									<div className="text-ink">
										{formatNumber(entry.volume, 0)} {METRIC_UNIT.volume}
									</div>
								</div>
							</div>
						</Link>
					</li>
				))}
			</ul>

			{/* Desktop: table */}
			<div className="hidden overflow-x-auto rounded-md border border-edge md:block">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-edge border-b bg-surface-2/50 text-xs">
							<th className="px-3 py-1.5 text-left text-ink-muted">Date</th>
							<th className="px-3 py-1.5 text-right text-ink-muted">{METRIC_LABEL.weight}</th>
							<th className="px-3 py-1.5 text-right text-ink-muted">{METRIC_LABEL.e1rm}</th>
							<th className="px-3 py-1.5 text-right text-ink-muted">{METRIC_LABEL.volume}</th>
							<th className="px-3 py-1.5 text-right text-ink-muted">Sets</th>
						</tr>
					</thead>
					<tbody>
						{sorted.map(entry => (
							<tr
								key={entry.sessionId}
								className="border-edge border-b last:border-b-0 hover:bg-surface-2"
							>
								<td className="px-3 py-1.5">
									<Link
										to={`/workouts/sessions/${entry.sessionId}`}
										className="text-ink hover:text-accent"
									>
										{formatDate(entry.startedAt)}
									</Link>
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">
									{formatTopSet(entry.topSet)}
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">
									{entry.e1rm > 0 ? `${formatNumber(entry.e1rm)}${METRIC_UNIT.e1rm}` : '—'}
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">
									{formatNumber(entry.volume, 0)}
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-ink-muted tabular-nums">
									{entry.workingSetCount}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	)
}
