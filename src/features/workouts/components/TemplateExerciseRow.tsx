import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TrainingGoal } from '@macromaxxing/db'
import { GripVertical, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Button, NumberInput } from '~/components/ui'
import { cn } from '~/lib/cn'
import { TRAINING_DEFAULTS } from '../utils/sets'
import { WorkoutModes } from '../WorkoutMode'
import type { TemplateExercise } from '../WorkoutTemplatePage'

export interface TemplateExerciseRowProps {
	id: string
	exercise: TemplateExercise
	trainingGoal: TrainingGoal
	supersetLabel: string | null
	isSuperset: boolean
	isFirstInGroup: boolean
	isLastInGroup: boolean
	onUpdate: (updates: Partial<TemplateExercise>) => void
	onRemove: () => void
}

export const TemplateExerciseRow: FC<TemplateExerciseRowProps> = ({
	id,
	exercise,
	trainingGoal,
	supersetLabel,
	isSuperset,
	isFirstInGroup,
	isLastInGroup,
	onUpdate,
	onRemove
}) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	const style = { transform: CSS.Translate.toString(transform), transition }
	const defaults = TRAINING_DEFAULTS[trainingGoal]
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex flex-wrap items-center gap-x-2 gap-y-1 border border-edge bg-surface-1 px-2 py-1.5',
				isSuperset ? 'border-l-2 border-l-accent' : '',
				isFirstInGroup ? 'rounded-t-sm' : '',
				isLastInGroup ? 'rounded-b-sm' : '',
				!isSuperset && 'rounded-sm',
				isDragging && 'z-10 opacity-50'
			)}
		>
			<button
				type="button"
				className="cursor-grab touch-none text-ink-faint hover:text-ink active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>
			{supersetLabel && (
				<span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
					{supersetLabel}
				</span>
			)}
			<span className="min-w-0 flex-1 text-ink text-sm">{exercise.exerciseName}</span>
			<WorkoutModes value={exercise.setMode} onChange={mode => onUpdate({ setMode: mode })} />
			<Button
				variant="ghost"
				size="icon"
				className="size-6 text-ink-faint hover:text-destructive md:order-last"
				onClick={onRemove}
			>
				<Trash2 className="size-3" />
			</Button>
			<div className="basis-full md:hidden" />
			<NumberInput
				className="w-14"
				value={exercise.targetSets ?? ''}
				placeholder={String(defaults.targetSets)}
				onChange={e => {
					const v = Number.parseInt(e.target.value, 10)
					onUpdate({ targetSets: Number.isNaN(v) || v === 0 ? null : v })
				}}
				min={1}
				step={1}
			/>
			<span className="text-ink-faint text-xs">sets</span>
			<span className="text-ink-faint text-xs">×</span>
			<NumberInput
				className="w-14"
				value={exercise.targetReps ?? ''}
				placeholder={String(defaults.targetReps)}
				onChange={e => {
					const v = Number.parseInt(e.target.value, 10)
					onUpdate({ targetReps: Number.isNaN(v) || v === 0 ? null : v })
				}}
				min={1}
				step={1}
			/>
			<span className="text-ink-faint text-xs">reps</span>
			<span className="text-ink-faint text-xs">@</span>
			<NumberInput
				className="w-20"
				value={exercise.targetWeight ?? ''}
				unit="kg"
				onChange={e => {
					const v = Number.parseFloat(e.target.value)
					onUpdate({ targetWeight: Number.isNaN(v) ? null : v })
				}}
				min={0}
				step={0.5}
			/>
		</div>
	)
}
