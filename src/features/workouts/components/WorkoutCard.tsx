import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TypeIDString } from '@macromaxxing/db'
import { GripVertical, Pencil, Play } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '~/components/ui'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'

type Workout = RouterOutput['workout']['listWorkouts'][number]

export interface WorkoutCardProps {
	label?: string
	workout: Workout
	onStartSession: (workoutId: TypeIDString<'wkt'>) => void
	isPending?: boolean
}

export const WorkoutCard: FC<WorkoutCardProps> = ({ label, workout, onStartSession, isPending }) => {
	const navigate = useNavigate()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: workout.id
	})

	const style = {
		transform: CSS.Translate.toString(transform),
		transition
	}

	return (
		<Card ref={setNodeRef} style={style} className={cn('flex items-stretch', isDragging && 'z-10 opacity-50')}>
			<button
				type="button"
				className="mx-2 flex shrink-0 cursor-grab touch-none items-center text-ink-faint hover:text-ink active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>

			<div className="min-w-0 flex-1 py-2">
				<h3 className="font-medium text-ink">{label ?? workout.name}</h3>
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
			</div>

			<div className="flex shrink-0 items-center gap-1 pr-2">
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
			</div>
		</Card>
	)
}
