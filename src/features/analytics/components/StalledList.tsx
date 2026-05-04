import type { FC } from 'react'
import { Link } from 'react-router-dom'
import type { RouterOutput } from '~/lib/trpc'

type Stalled = RouterOutput['analytics']['stalledExercises'][number]

export interface StalledListProps {
	stalled: Stalled[]
}

function formatRelative(ts: number): string {
	const now = Date.now()
	const days = Math.floor((now - ts) / (1000 * 60 * 60 * 24))
	if (days === 0) return 'Today'
	if (days === 1) return 'Yesterday'
	if (days < 7) return `${days}d ago`
	if (days < 30) return `${Math.floor(days / 7)}w ago`
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const StalledList: FC<StalledListProps> = ({ stalled }) => {
	if (stalled.length === 0) {
		return <div className="py-4 text-center text-ink-faint text-sm">Nothing clearly stalled</div>
	}

	return (
		<div className="space-y-1">
			{stalled.map(s => (
				<div
					key={s.exerciseId}
					className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/exercises/${s.exerciseId}`}
								className="font-medium text-ink text-sm hover:underline"
							>
								{s.exerciseName}
							</Link>
							<span className="text-[10px] text-ink-faint uppercase tracking-wide">stalled</span>
						</div>
						<div className="font-mono text-ink-faint text-xs tabular-nums">
							e1RM {s.currentMaxE1rm.toFixed(1)} kg · last {formatRelative(s.lastSessionAt)}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
