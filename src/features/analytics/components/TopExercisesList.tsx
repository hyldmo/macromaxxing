import type { FC } from 'react'
import { Link } from 'react-router'
import type { RouterOutput } from '~/lib/trpc'

type Top = RouterOutput['analytics']['topExercises'][number]

export interface TopExercisesListProps {
	top: Top[]
}

function formatRelative(ts: number): string {
	const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
	if (days === 0) return 'today'
	if (days === 1) return 'yesterday'
	if (days < 7) return `${days}d ago`
	if (days < 30) return `${Math.floor(days / 7)}w ago`
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const TopExercisesList: FC<TopExercisesListProps> = ({ top }) => {
	if (top.length === 0) {
		return <div className="py-4 text-center text-ink-faint text-sm">No exercises logged in this window yet.</div>
	}

	return (
		<div className="space-y-1">
			{top.map(t => (
				<div
					key={t.exerciseId}
					className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
				>
					<div className="min-w-0 flex-1">
						<Link
							to={`/exercises/${t.exerciseId}`}
							className="font-medium text-ink text-sm hover:underline"
						>
							{t.exerciseName}
						</Link>
						<div className="font-mono text-ink-faint text-xs tabular-nums">
							{t.workingSetCount} sets · {t.sessionCount} sessions · last{' '}
							{formatRelative(t.lastSessionAt)}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
