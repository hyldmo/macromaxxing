import { TrendingUp } from 'lucide-react'
import type { FC } from 'react'
import { cn, type E1rmStat, isE1rmPR, METRIC_LABEL, METRIC_UNIT } from '~/lib'

export interface E1rmTableProps {
	stats: E1rmStat[]
	/**
	 * Per-exercise prior best e1RM. v1 sources this from the most-recent prior session
	 * (`lastSessionsForExercises[exerciseId].topE1rm`), not the all-time max — same
	 * "you beat last time" semantics as SetRow's inline PR.
	 */
	priorMaxByExercise?: Record<string, number>
}

export const E1rmTable: FC<E1rmTableProps> = ({ stats, priorMaxByExercise }) => (
	<>
		<div className="mb-2 flex items-center justify-end gap-1.5 text-accent">
			<TrendingUp className="size-3.5 text-ink-faint" />
			<span className="text-xs">Estimated {METRIC_LABEL.e1rm}</span>
		</div>
		<div className="space-y-1.5">
			{stats.map(s => {
				const prior = priorMaxByExercise?.[s.exerciseId] ?? 0
				const isPR = prior > 0 && isE1rmPR({ weightKg: s.weightKg, reps: s.reps }, prior)
				return (
					<div key={s.exerciseId} className="flex items-baseline justify-between gap-2">
						<span className="min-w-0 truncate text-ink text-sm">{s.name}</span>
						<div className="flex shrink-0 items-baseline gap-2 font-mono text-[11px] tabular-nums">
							<span className="text-ink-faint">
								{s.weightKg}
								{METRIC_UNIT.e1rm} × {s.reps}
							</span>
							<span className={cn('font-semibold', isPR ? 'text-success' : 'text-accent')}>
								{isPR && '↑ '}
								{s.e1rm.toFixed(0)}
								{METRIC_UNIT.e1rm}
							</span>
						</div>
					</div>
				)
			})}
		</div>
	</>
)
