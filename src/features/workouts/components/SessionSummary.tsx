import type { Exercise } from '@macromaxxing/db'
import { ArrowRight, Clock, Dumbbell } from 'lucide-react'
import { type FC, useMemo } from 'react'
import { cn, computeDivergences, type Divergence, exerciseE1rmStats, totalVolume } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { METRIC_LABEL, METRIC_UNIT } from '~/lib/workouts/constants'
import { E1rmTable } from './E1rmTable'

type Session = RouterOutput['workout']['getSession']

export interface SessionSummaryProps {
	session: Session
	plannedExercises: Session['plannedExercises']
}

function formatDuration(startMs: number, endMs: number): string {
	const mins = Math.round((endMs - startMs) / 60_000)
	if (mins < 60) return `${mins}m`
	const h = Math.floor(mins / 60)
	const m = mins % 60
	return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const DivergenceRow: FC<{ d: Divergence }> = ({ d }) => (
	<div className="flex items-center gap-2 rounded-sm border border-edge bg-surface-0 px-3 py-2">
		<div className="min-w-0 flex-1">
			<div className="text-ink text-sm">{d.exerciseName}</div>
			<div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
				<span className="text-ink-faint">
					{d.planned.sets}×{d.planned.reps}
					{d.planned.weight != null && ` @${d.planned.weight}kg`}
				</span>
				<ArrowRight className="size-3 text-ink-faint" />
				<span className={cn(d.improved ? 'text-success' : 'text-macro-kcal')}>
					{d.actual.sets}×{d.actual.reps}
					{d.actual.weight > 0 && ` @${d.actual.weight}kg`}
				</span>
			</div>
		</div>
	</div>
)

export const SessionSummary: FC<SessionSummaryProps> = ({ session, plannedExercises }) => {
	const vol = totalVolume(session.logs)
	const e1rmStats = exerciseE1rmStats(session.logs)
	const workoutGoal = session.workout?.trainingGoal ?? 'hypertrophy'

	const divergences =
		plannedExercises.length > 0 ? computeDivergences(session.logs, plannedExercises, workoutGoal) : []

	// Prior best e1RM per exercise — uses most-recent prior session (not all-time max).
	// Same Option A trade-off as the inline SetRow PR: simple, batched, false-positives
	// possible after a deload week, but accurate enough for the recap acknowledgement.
	const priorExerciseIds = useMemo<Exercise['id'][]>(
		() => e1rmStats.map(s => s.exerciseId as Exercise['id']),
		[e1rmStats]
	)
	const lastSessionsQuery = trpc.workout.lastSessionsForExercises.useQuery(
		{ exerciseIds: priorExerciseIds, before: session.startedAt },
		{ enabled: priorExerciseIds.length > 0 }
	)
	const priorMaxByExercise = useMemo<Record<string, number>>(() => {
		const out: Record<string, number> = {}
		const data = lastSessionsQuery.data
		if (!data) return out
		for (const [id, ls] of Object.entries(data)) {
			if (ls && ls.topE1rm > 0) out[id] = ls.topE1rm
		}
		return out
	}, [lastSessionsQuery.data])

	return (
		<div className="space-y-3">
			{/* Duration + Volume */}
			<div className="flex gap-3">
				{session.completedAt && (
					<div className="flex flex-1 items-center gap-2 rounded-sm border border-edge bg-surface-1 px-3 py-2">
						<Clock className="size-4 text-ink-faint" />
						<div>
							<div className="font-mono text-ink text-sm tabular-nums">
								{formatDuration(session.startedAt, session.completedAt)}
							</div>
							<div className="text-[10px] text-ink-faint">Duration</div>
						</div>
					</div>
				)}
				<div className="flex flex-1 items-center gap-2 rounded-sm border border-edge bg-surface-1 px-3 py-2">
					<Dumbbell className="size-4 text-ink-faint" />
					<div>
						<div className="font-mono text-ink text-sm tabular-nums">{(vol / 1000).toFixed(1)}k</div>
						<div className="text-[10px] text-ink-faint">
							{METRIC_LABEL.volume} ({METRIC_UNIT.volume})
						</div>
					</div>
				</div>
			</div>

			{/* Estimated 1RM */}
			{e1rmStats.length > 0 && (
				<div className="rounded-sm border border-edge bg-surface-1 p-3">
					<E1rmTable stats={e1rmStats} priorMaxByExercise={priorMaxByExercise} />
				</div>
			)}

			{/* Plan Comparison */}
			{divergences.length > 0 && (
				<div className="rounded-sm border border-edge bg-surface-1 p-3">
					<p className="mb-2 text-ink-muted text-xs">Planned vs Actual</p>
					<div className="space-y-1.5">
						{divergences.map(d => (
							<DivergenceRow key={d.exerciseId} d={d} />
						))}
					</div>
				</div>
			)}
		</div>
	)
}
