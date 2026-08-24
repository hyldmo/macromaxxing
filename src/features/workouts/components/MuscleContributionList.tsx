import type { ExerciseContribution } from '@macromaxxing/db'
import type { FC } from 'react'

export interface MuscleContributionListProps {
	exercises: readonly ExerciseContribution[]
	/** Exercises past this many collapse into a "+N more" line, so a tooltip stays a tooltip. */
	max?: number
}

/**
 * The "which exercises put the sets here" lines under a body-map tooltip's effective-set count.
 * Fed by `computeExerciseBreakdown`, so the numbers sum to the muscle's `workingSets` above them.
 */
export const MuscleContributionList: FC<MuscleContributionListProps> = ({ exercises, max = 6 }) => {
	if (exercises.length === 0) return null
	const shown = exercises.slice(0, max)
	const hidden = exercises.length - shown.length

	return (
		<div className="mt-1 space-y-0.5 border-edge border-t pt-1 font-mono text-[10px] text-ink-faint tabular-nums">
			{shown.map(e => (
				<div key={e.name} className="flex justify-between gap-2">
					<span className="min-w-0 truncate">{e.name}</span>
					<span className="shrink-0 text-ink-muted">{e.sets.toFixed(1)}</span>
				</div>
			))}
			{hidden > 0 && <div>+{hidden} more</div>}
		</div>
	)
}
