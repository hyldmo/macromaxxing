import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Equipment, TrainingGoal } from '@macromaxxing/db'
import { GripVertical, NotebookPen, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router'
import { Button, Input, NumberInput } from '~/components/ui'
import {
	cn,
	effectiveSetWeightKg,
	estimated1RM,
	getRepRange,
	METRIC_LABEL,
	METRIC_UNIT,
	TRAINING_DEFAULTS
} from '~/lib'
import { TrainingGoalToggle } from '../TrainingGoalToggle'
import { WorkoutModes } from '../WorkoutMode'
import type { TemplateExercise } from '../WorkoutTemplatePage'
import { EquipmentWarning } from './EquipmentWarning'
import { LastSessionHint, type LastSessionHintProps } from './LastSessionHint'

export interface TemplateExerciseRowProps {
	id: string
	exercise: TemplateExercise
	trainingGoal: TrainingGoal
	bodyWeightKg: number | null
	supersetLabel: string | null
	isSuperset: boolean
	isFirstInGroup: boolean
	isLastInGroup: boolean
	lastSession?: LastSessionHintProps['lastSession']
	/** Equipment the workout's location lacks for this exercise. Empty = available (or no location set). */
	missingEquipment?: readonly Equipment[]
	onUpdate: (updates: Partial<TemplateExercise>) => void
	onRemove: () => void
}

export const TemplateExerciseRow: FC<TemplateExerciseRowProps> = ({
	id,
	exercise,
	trainingGoal,
	bodyWeightKg,
	supersetLabel,
	isSuperset,
	isFirstInGroup,
	isLastInGroup,
	lastSession,
	missingEquipment = [],
	onUpdate,
	onRemove
}) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	const style = { transform: CSS.Translate.toString(transform), transition }
	const effectiveGoal = exercise.trainingGoal ?? trainingGoal
	const defaults = TRAINING_DEFAULTS[effectiveGoal]
	const range = getRepRange(
		{
			type: exercise.exerciseType,
			strengthRepsMin: exercise.strengthRepsMin,
			strengthRepsMax: exercise.strengthRepsMax,
			hypertrophyRepsMin: exercise.hypertrophyRepsMin,
			hypertrophyRepsMax: exercise.hypertrophyRepsMax
		},
		effectiveGoal
	)
	const aboveRange = exercise.targetReps != null && exercise.targetReps > range.max
	const isBw = exercise.bwMultiplier > 0
	const effectiveWeight =
		exercise.targetWeight != null && exercise.targetReps != null
			? effectiveSetWeightKg(exercise.bwMultiplier, bodyWeightKg, exercise.targetWeight)
			: null
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'border border-edge bg-surface-1 px-2 py-1.5',
				isSuperset ? 'border-l-2 border-l-accent' : '',
				isFirstInGroup ? 'rounded-t-sm' : '',
				isLastInGroup ? 'rounded-b-sm' : '',
				!isSuperset && 'rounded-sm',
				isDragging && 'z-10 opacity-50'
			)}
		>
			{lastSession && <LastSessionHint lastSession={lastSession} className="mb-1 pl-6" />}
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
				<span className="min-w-40 flex-1 text-ink text-sm">
					<Link to={`/exercises/${exercise.exerciseId}`} className="hover:underline">
						{exercise.exerciseName}
					</Link>
					<EquipmentWarning missing={missingEquipment} className="ml-2 align-middle" />
				</span>
				{effectiveWeight != null && effectiveWeight > 0 && exercise.targetReps && (
					<span className="text-ink-muted text-xs max-lg:hidden">
						{Math.round(estimated1RM(effectiveWeight, exercise.targetReps))}
						{METRIC_UNIT.e1rm} {METRIC_LABEL.e1rm}
					</span>
				)}
				<TrainingGoalToggle
					workoutGoal={trainingGoal}
					value={exercise.trainingGoal}
					onChange={goal => onUpdate({ trainingGoal: goal })}
				/>
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
					className={cn('w-14', aboveRange && 'border-amber-400/60')}
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
				{isBw && <span className="text-ink-faint text-xs">+</span>}
				<NumberInput
					className="w-20"
					value={exercise.targetWeight ?? ''}
					unit="kg"
					placeholder={isBw ? '+kg' : undefined}
					onChange={e => {
						const v = Number.parseFloat(e.target.value)
						onUpdate({ targetWeight: Number.isNaN(v) ? null : v })
					}}
					min={0}
					step={0.5}
				/>
			</div>
			<div className="mt-1.5 flex items-center gap-1.5 pl-6">
				<NotebookPen className="size-3 shrink-0 text-ink-faint" />
				<Input
					className="h-7 border-dashed text-xs"
					value={exercise.note ?? ''}
					placeholder="Note"
					onChange={e => onUpdate({ note: e.target.value })}
				/>
			</div>
		</div>
	)
}
