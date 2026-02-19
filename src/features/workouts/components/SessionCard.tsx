import { ChevronRight } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router-dom'
import { totalVolume } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type Session = RouterOutput['workout']['listSessions'][number]

export interface SessionCardProps {
	session: Session
}

function formatDate(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatDuration(start: number, end: number | null): string {
	if (!end) return 'in progress'
	const mins = Math.round((end - start) / 60000)
	if (mins < 60) return `${mins}m`
	return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export const SessionCard: FC<SessionCardProps> = ({ session }) => {
	const exercises = new Set(session.logs.map(l => l.exercise.name))
	const vol = totalVolume(session.logs)

	return (
		<Link
			to={`/workouts/sessions/${session.id}`}
			className="flex items-center gap-3 rounded-sm border border-edge bg-surface-1 px-3 py-2 transition-colors hover:bg-surface-2"
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium text-ink text-sm">
						{session.name ?? formatDate(session.startedAt)}
					</span>
					{session.completedAt ? (
						<span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">
							completed
						</span>
					) : (
						<span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">active</span>
					)}
				</div>
				<div className="mt-0.5 font-mono text-ink-muted text-xs tabular-nums">
					{exercises.size} exercises · {session.logs.length} sets · {(vol / 1000).toFixed(1)}k vol ·{' '}
					{formatDuration(session.startedAt, session.completedAt)}
					{session.completedAt && ` · finished ${formatTime(session.completedAt)}`}
				</div>
			</div>
			<ChevronRight className="size-4 shrink-0 text-ink-faint" />
		</Link>
	)
}
