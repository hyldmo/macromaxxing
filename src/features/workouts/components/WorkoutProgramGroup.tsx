import type { TypeIDString } from '@macromaxxing/db'
import type { FC } from 'react'
import { computeProgramLoad, formatAgo } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { WorkoutCard } from './WorkoutCard'
import { WorkoutGroupHeader } from './WorkoutGroupHeader'

type Workout = RouterOutput['workout']['listWorkouts'][number]
type Session = RouterOutput['workout']['listSessions'][number]

interface WorkoutProgramGroupProps {
	programId: TypeIDString<'wpr'>
	programName: string
	workouts: Workout[]
	sessions: readonly Session[]
	isActive: boolean
	upNextId?: TypeIDString<'wkt'> | null
	day?: number
	total?: number
	onStartSession: (id: TypeIDString<'wkt'>) => void
	isPending?: boolean
}

export const WorkoutProgramGroup: FC<WorkoutProgramGroupProps> = ({
	programId,
	programName,
	workouts,
	sessions,
	isActive,
	upNextId,
	day,
	total,
	onStartSession,
	isPending
}) => {
	const memberIds = new Set(workouts.map(w => w.id))
	const lastSession = sessions.find(s => s.workoutId && s.completedAt && memberIds.has(s.workoutId))

	const cycleSets = workouts.length > 0 ? computeProgramLoad(workouts).totals.workingSets : 0

	const metaParts: string[] = []
	if (isActive && day && total) metaParts.push(`Day ${day} of ${total}`)
	if (lastSession?.completedAt) metaParts.push(`last completed ${formatAgo(lastSession.completedAt)}`)
	if (cycleSets > 0) metaParts.push(`${cycleSets.toFixed(0)} sets/cycle`)

	return (
		<section className="space-y-2">
			<WorkoutGroupHeader
				title={programName}
				titleHref={`/plans/programs/${programId}`}
				status={
					isActive ? (
						<span className="font-mono text-[10px] text-accent uppercase tracking-wide">active</span>
					) : (
						<span className="font-mono text-[10px] text-ink-faint uppercase tracking-wide">
							{workouts.length} workout{workouts.length === 1 ? '' : 's'}
						</span>
					)
				}
				cycle={workouts.map(w => ({ id: w.id, name: w.name }))}
				meta={metaParts.length > 0 ? metaParts.join(' · ') : undefined}
			/>
			<div className="space-y-1.5">
				{workouts.map((workout, i) => (
					<WorkoutCard
						key={workout.id}
						label={`${i + 1}. ${workout.name}`}
						workout={workout}
						onStartSession={onStartSession}
						isPending={isPending}
						variant={isActive ? 'full' : 'compact'}
						highlighted={isActive && upNextId === workout.id}
					/>
				))}
			</div>
		</section>
	)
}
