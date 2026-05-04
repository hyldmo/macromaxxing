import { ArrowUp } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router-dom'
import type { RouterOutput } from '~/lib/trpc'

type PR = RouterOutput['analytics']['recentPRs'][number]

export interface RecentPRsListProps {
	prs: PR[]
	limit?: number
}

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const RecentPRsList: FC<RecentPRsListProps> = ({ prs, limit = 10 }) => {
	if (prs.length === 0) {
		return <div className="py-4 text-center text-ink-faint text-sm">No new bests in this window</div>
	}

	// Server returns oldest → newest; show newest first to the user.
	const newestFirst = [...prs].reverse()
	const visible = newestFirst.slice(0, limit)
	const hiddenCount = newestFirst.length - visible.length

	return (
		<div className="space-y-1">
			{visible.map(pr => (
				<div
					key={`${pr.sessionId}-${pr.exerciseId}`}
					className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
				>
					<div className="min-w-0 flex-1">
						<Link
							to={`/exercises/${pr.exerciseId}`}
							className="font-medium text-ink text-sm hover:underline"
						>
							{pr.exerciseName}
						</Link>
						<div className="font-mono text-ink-faint text-xs tabular-nums">
							{pr.weightKg.toFixed(1)} kg × {pr.reps} · {formatDate(pr.startedAt)}
						</div>
					</div>
					<div className="flex flex-col items-end font-mono tabular-nums">
						<div className="flex items-center gap-1 text-sm text-success">
							<ArrowUp className="size-3.5" />
							<span>{pr.e1rm.toFixed(1)} kg</span>
						</div>
						<div className="text-[10px] text-success">+{pr.deltaFromPrior.toFixed(1)} kg</div>
					</div>
				</div>
			))}
			{hiddenCount > 0 && (
				<div className="px-2 pt-1 text-ink-faint text-xs">
					Showing {visible.length} of {newestFirst.length} PRs
				</div>
			)}
		</div>
	)
}
