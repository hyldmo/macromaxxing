import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TypeIDString } from '@macromaxxing/db'
import { GripVertical, Pencil, Play } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'

type Workout = RouterOutput['workout']['listWorkouts'][number]

export interface WorkoutCardProps {
	workout: Workout
	onStartSession: (workoutId: TypeIDString<'wkt'>) => void
	isPending?: boolean
}

export const WorkoutCard: FC<WorkoutCardProps> = ({ workout, onStartSession, isPending }) => {
	const navigate = useNavigate()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: workout.id
	})

	const style = {
		transform: CSS.Transform.toString(transform),
		transition
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn('rounded-[--radius-md] border border-edge bg-surface-1 p-3', isDragging && 'z-10 opacity-50')}
		>
			<div className="flex items-start justify-between gap-2">
				<button
					type="button"
					className="mt-0.5 shrink-0 cursor-grab touch-none text-ink-faint hover:text-ink active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
				<div className="min-w-0 flex-1">
					<h3 className="font-medium text-ink">{workout.name}</h3>
					<div className="mt-0.5 font-mono text-ink-muted text-xs tabular-nums">
						{workout.exercises.length} exercises
					</div>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-ink-faint hover:text-ink"
						onClick={() => navigate(`/workouts/${workout.id}`)}
					>
						<Pencil className="size-3.5" />
					</Button>
				</div>
			</div>

			<div className="mt-2 space-y-0.5">
				{workout.exercises.slice(0, 6).map(we => (
					<div key={we.id} className="flex items-center gap-2 font-mono text-xs tabular-nums">
						<span className="min-w-0 flex-1 truncate text-ink-muted">{we.exercise.name}</span>
						<span className="text-ink-faint">
							{we.targetSets}×{we.targetReps}
							{we.targetWeight != null && ` @${we.targetWeight}kg`}
						</span>
					</div>
				))}
				{workout.exercises.length > 6 && (
					<div className="text-ink-faint text-xs">+{workout.exercises.length - 6} more</div>
				)}
			</div>

			<Button className="mt-3 w-full" size="sm" onClick={() => onStartSession(workout.id)} disabled={isPending}>
				<Play className="size-3.5" />
				Start Session
			</Button>
		</div>
	)
}
