import type { TypeIDString } from '@macromaxxing/db'
import { MapPin, Pencil, Play } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button, Card } from '~/components/ui'
import { cn, effectiveSetWeightKg, generatePlannedSets, resolveExerciseTargets, totalVolume } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'

type Workout = RouterOutput['workout']['listWorkouts'][number]

function workoutVolume(workout: Workout, bodyWeightKg: number | null): number {
	const warmedUpMuscles = new Map<string, number>()
	let vol = 0
	for (const we of workout.exercises) {
		const { sets, reps, weightKg } = resolveExerciseTargets(we, workout.trainingGoal)
		const planned = generatePlannedSets({
			setMode: we.setMode ?? 'working',
			sets,
			reps,
			weightKg,
			muscles: we.exercise.muscles,
			warmedUpMuscles,
			bwMultiplier: we.exercise.bwMultiplier
		})
		vol += totalVolume(
			planned.map(s => ({
				weightKg: effectiveSetWeightKg(we.exercise.bwMultiplier, bodyWeightKg, s.weightKg ?? 0),
				reps: s.reps
			}))
		)
	}
	return vol
}

function workingSetCount(workout: Workout): number {
	let sets = 0
	for (const we of workout.exercises) {
		const { sets: s } = resolveExerciseTargets(we, workout.trainingGoal)
		sets += s
	}
	return sets
}

export interface WorkoutCardProps {
	label?: string
	workout: Workout
	onStartSession: (workoutId: TypeIDString<'wkt'>) => void
	isPending?: boolean
	variant?: 'full' | 'compact'
	highlighted?: boolean
	dragHandle?: ReactNode
	className?: string
	style?: React.CSSProperties
}

export const WorkoutCard = forwardRef<HTMLDivElement, WorkoutCardProps>(
	(
		{ label, workout, onStartSession, isPending, variant = 'full', highlighted, dragHandle, className, style },
		ref
	) => {
		const navigate = useNavigate()
		const profileQuery = trpc.settings.getProfile.useQuery()
		const bodyWeightKg = profileQuery.data?.weightKg ?? null
		const vol = workoutVolume(workout, bodyWeightKg)
		const isCompact = variant === 'compact'

		return (
			<Card
				ref={ref}
				style={style}
				className={cn('flex items-center gap-2 px-2', highlighted && 'border-accent', className)}
			>
				{dragHandle}

				<div className={cn('min-w-0 flex-1 gap-2', isCompact ? 'py-1.5' : 'py-2')}>
					<div className="flex items-center gap-2">
						<h3 className="min-w-0 truncate font-medium text-ink">{label ?? workout.name}</h3>
						{workout.location && (
							<span className="flex shrink-0 items-center gap-0.5 text-ink-faint text-xs">
								<MapPin className="size-3 shrink-0" />
								<span className="max-w-28 truncate">{workout.location.name}</span>
							</span>
						)}
						{highlighted && (
							<span className="shrink-0 font-mono text-[10px] text-accent uppercase tracking-wide">
								up next
							</span>
						)}
						<span className="ml-auto shrink-0 font-mono text-ink-muted text-xs tabular-nums">
							{(vol / 1000).toFixed(1)}k vol
						</span>
					</div>
					{isCompact ? (
						<div className="mt-0.5 font-mono text-ink-faint text-xs tabular-nums">
							{workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'} ·{' '}
							{workingSetCount(workout)} working sets
						</div>
					) : (
						<div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 font-mono text-xs tabular-nums">
							{workout.exercises.slice(0, 6).map(we => (
								<span key={we.id} className="text-ink-muted">
									{we.exercise.name}{' '}
									<span className="text-ink-faint">
										{we.targetSets}×{we.targetReps}
									</span>
								</span>
							))}
							{workout.exercises.length > 6 && (
								<span className="text-ink-faint">+{workout.exercises.length - 6} more</span>
							)}
						</div>
					)}
				</div>

				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-ink-faint hover:text-ink"
					onClick={() => navigate(`/workouts/${workout.id}`)}
				>
					<Pencil className="size-3.5" />
				</Button>
				<Button size="sm" onClick={() => onStartSession(workout.id)} disabled={isPending}>
					<Play className="size-3.5" />
					Start
				</Button>
			</Card>
		)
	}
)
WorkoutCard.displayName = 'WorkoutCard'
