import type { FC } from 'react'
import { cn } from '~/lib'
import { classifyRecovery, type RestTransition } from '~/lib/workouts/programRest'
import { MuscleRestChip } from './MuscleChip'

export interface ProgramRestTransitionProps {
	transition: RestTransition
	/** True when this transition is the cycle wrap (last → first). */
	isWrap: boolean
}

export const ProgramRestTransition: FC<ProgramRestTransitionProps> = ({ transition, isWrap }) => {
	const { muscles, bottleneckHours, bottleneckMuscle } = transition
	const hasOverlap = muscles.length > 0
	const bucket = hasOverlap ? classifyRecovery(bottleneckHours) : 'fresh'
	const headlineTone =
		bucket === 'heavy' ? 'text-destructive' : bucket === 'moderate' ? 'text-amber-500' : 'text-success'

	return (
		<div className="grid grid-cols-[1.5rem_1fr] items-start gap-2 pl-1">
			<div className="flex justify-center">
				<div
					className={cn(
						'flex h-full min-h-3 w-px flex-col items-center',
						isWrap ? 'border-edge border-l border-dashed' : 'bg-edge'
					)}
					aria-hidden
				/>
			</div>
			<div className="flex min-w-0 flex-wrap items-center gap-1 py-1">
				<span className={cn('font-mono text-[10px] uppercase tracking-wide', headlineTone)}>
					{hasOverlap
						? `≥${bottleneckHours}h${bottleneckMuscle ? ` (${bottleneckMuscle.replace('_', ' ')})` : ''}`
						: 'no overlap'}
				</span>
				{hasOverlap &&
					muscles.map(m => (
						<MuscleRestChip key={m.muscleGroup} muscleGroup={m.muscleGroup} hours={m.recoveryHours} />
					))}
				{isWrap && (
					<span className="ml-auto font-mono text-[10px] text-ink-faint uppercase tracking-wide">
						cycles →
					</span>
				)}
			</div>
		</div>
	)
}
