import { ArrowRight, Clock, Dumbbell, TrendingUp } from 'lucide-react'
import type { FC } from 'react'
import { cn, computeDivergences, type Divergence, exerciseE1rmStats, totalVolume } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

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
						<div className="text-[10px] text-ink-faint">Volume (kg)</div>
					</div>
				</div>
			</div>

			{/* Estimated 1RM */}
			{e1rmStats.length > 0 && (
				<div className="rounded-sm border border-edge bg-surface-1 p-3">
					<div className="mb-2 flex items-center gap-1.5">
						<TrendingUp className="size-3.5 text-ink-faint" />
						<span className="text-ink-muted text-xs">Estimated 1RM</span>
					</div>
					<div className="space-y-1.5">
						{e1rmStats.map(s => (
							<div key={s.name} className="flex items-baseline justify-between gap-2">
								<span className="min-w-0 truncate text-ink text-sm">{s.name}</span>
								<div className="flex shrink-0 items-baseline gap-2 font-mono text-[11px] tabular-nums">
									<span className="text-ink-faint">
										{s.weightKg}kg × {s.reps}
									</span>
									<span className="font-semibold text-accent">{s.e1rm.toFixed(0)}kg</span>
								</div>
							</div>
						))}
					</div>
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
