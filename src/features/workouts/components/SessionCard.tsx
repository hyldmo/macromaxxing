import { ChevronRight } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router-dom'
import { formatAgo, formatDate, formatDuration, totalVolume } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type Session = RouterOutput['workout']['listSessions'][number]

export interface SessionCardProps {
	session: Session
}

export const SessionCard: FC<SessionCardProps> = ({ session }) => {
	const exercises = new Set(session.logs.map(l => l.exercise.name))
	const vol = totalVolume(session.logs)
	const displayName = session.name ?? formatDate(session.startedAt)
	const workoutId = session.workoutId

	return (
		<div className="flex items-center gap-3 rounded-sm border border-edge bg-surface-1 px-3 py-2 transition-colors hover:bg-surface-2">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					{workoutId ? (
						<Link to={`/workouts/${workoutId}`} className="font-medium text-ink text-sm hover:underline">
							{displayName}
						</Link>
					) : (
						<span className="font-medium text-ink text-sm">{displayName}</span>
					)}
					{session.completedAt ? (
						<span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">
							completed
						</span>
					) : (
						<span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">active</span>
					)}
				</div>
				<div className="mt-0.5 font-mono text-ink-muted text-xs tabular-nums">
					{[
						`${exercises.size} exercises`,
						`${session.logs.length} sets`,
						`${(vol / 1000).toFixed(1)}k vol`,
						formatDuration(session.startedAt, session.completedAt),
						session.completedAt && `finished ${formatAgo(session.completedAt)}`
					]
						.filter(Boolean)
						.join(' · ')}
				</div>
			</div>
			<Link
				to={`/workouts/sessions/${session.id}`}
				className="flex shrink-0 items-center text-ink-faint hover:text-ink"
				aria-label="Open session"
			>
				<ChevronRight className="size-4" />
			</Link>
		</div>
	)
}
