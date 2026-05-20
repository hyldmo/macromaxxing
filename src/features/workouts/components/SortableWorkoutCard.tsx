import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '~/lib'
import { WorkoutCard, type WorkoutCardProps } from './WorkoutCard'

export const SortableWorkoutCard: FC<Omit<WorkoutCardProps, 'dragHandle' | 'style' | 'className'>> = props => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: props.workout.id
	})

	return (
		<WorkoutCard
			{...props}
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(isDragging && 'z-10 opacity-50')}
			dragHandle={
				<button
					type="button"
					className="flex shrink-0 cursor-grab touch-none items-center text-ink-faint hover:text-ink active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
			}
		/>
	)
}
