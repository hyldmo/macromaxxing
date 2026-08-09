import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
	type Equipment,
	type ExerciseType,
	equipmentSet,
	type MuscleGroup,
	missingEquipment,
	type TypeIDString
} from '@macromaxxing/db'
import { GripVertical, SaveIcon, Trash2 } from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import { Button, Input, SaveButton } from '~/components/ui'
import { cn } from '~/lib'
import { type RouterInput, type RouterOutput, trpc } from '~/lib/trpc'
import { exerciseOverlapScore } from '~/lib/workouts/programRest'
import { EquipmentWarning } from './EquipmentWarning'
import { ExerciseSearch } from './ExerciseSearch'

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]
type ExercisePayload = NonNullable<RouterInput['workout']['updateWorkout']['exercises']>[number]

interface DraftExercise {
	uid: string
	/** Server row id. Absent on rows added here — those insert on save. */
	id?: TypeIDString<'wke'>
	exerciseId: TypeIDString<'exc'>
	name: string
	type: ExerciseType
}

function toDraft(workout: WorkoutTemplate): DraftExercise[] {
	return workout.exercises.map(e => ({
		uid: crypto.randomUUID(),
		id: e.id,
		exerciseId: e.exerciseId,
		name: e.exercise.name,
		type: e.exercise.type
	}))
}

export interface ProgramWorkoutEditorProps {
	workout: WorkoutTemplate
	/** Effective sets this slot of the cycle already carries per muscle — ranks the exercise suggestions. */
	overlapLoad: ReadonlyMap<MuscleGroup, number>
	/** Reported on every keystroke so the program page's unsaved-changes guard covers this panel too. */
	onDirtyChange: (dirty: boolean) => void
	onSaved: (name: string) => void
	onClose: () => void
}

/**
 * Inline slice of the workout template: its name, which exercises it holds, and their order.
 * Targets, set modes, supersets, goal and location stay on the full editor at /workouts/:id —
 * this is for shaping a program's days without leaving the cycle you are shaping them against.
 */
export const ProgramWorkoutEditor: FC<ProgramWorkoutEditorProps> = ({
	workout,
	overlapLoad,
	onDirtyChange,
	onSaved,
	onClose
}) => {
	const utils = trpc.useUtils()
	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const [name, setName] = useState(workout.name)
	const [rows, setRows] = useState<DraftExercise[]>(() => toDraft(workout))

	const dirty =
		name.trim() !== workout.name ||
		rows.length !== workout.exercises.length ||
		rows.some((r, i) => r.exerciseId !== workout.exercises[i].exerciseId)

	useEffect(() => {
		onDirtyChange(dirty)
		return () => onDirtyChange(false)
	}, [dirty, onDirtyChange])

	const updateMutation = trpc.workout.updateWorkout.useMutation({
		onSuccess: updated => {
			utils.workout.listWorkouts.invalidate()
			utils.workout.getWorkout.invalidate({ id: workout.id })
			onSaved(updated?.name ?? name.trim())
			onClose()
		}
	})

	// Equipment the workout's location lacks. No location = no warnings.
	const missingByExerciseId = useMemo(() => {
		const map = new Map<TypeIDString<'exc'>, Equipment[]>()
		const available = workout.location ? equipmentSet(workout.location.equipment) : null
		if (!(available && exercisesQuery.data)) return map
		for (const e of exercisesQuery.data) {
			const missing = missingEquipment(e.equipment, available)
			if (missing.length > 0) map.set(e.id, missing)
		}
		return map
	}, [workout.location, exercisesQuery.data])

	// One row per exercise per template, so what the workout already holds drops out of the picker.
	const candidates = useMemo(() => {
		const taken = new Set(rows.map(r => r.exerciseId))
		return (exercisesQuery.data ?? []).filter(e => !taken.has(e.id))
	}, [exercisesQuery.data, rows])

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return
		setRows(prev => {
			const oldIdx = prev.findIndex(r => r.uid === active.id)
			const newIdx = prev.findIndex(r => r.uid === over.id)
			if (oldIdx === -1 || newIdx === -1) return prev
			return arrayMove(prev, oldIdx, newIdx)
		})
	}

	function handleSave() {
		// Only id + exerciseId per surviving row: the server leaves every omitted field alone, so
		// targets, set modes and superset links set on the full editor survive an inline reorder.
		const exercises: ExercisePayload[] = rows.map(r =>
			r.id
				? { id: r.id, exerciseId: r.exerciseId }
				: { exerciseId: r.exerciseId, setMode: r.type === 'compound' ? 'warmup' : 'working' }
		)
		updateMutation.mutate({ id: workout.id, name: name.trim(), exercises })
	}

	return (
		<div className="ml-6 space-y-3 rounded-sm border border-accent/40 bg-surface-0 p-3">
			<div className="flex items-center gap-2">
				<Input
					value={name}
					onChange={e => setName(e.target.value)}
					placeholder="Workout name"
					className="flex-1"
					aria-label="Workout name"
				/>
				<Button variant="ghost" onClick={onClose}>
					Cancel
				</Button>
			</div>

			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={rows.map(r => r.uid)} strategy={verticalListSortingStrategy}>
					<div className="space-y-1">
						{rows.map((row, i) => (
							<DraftExerciseRow
								key={row.uid}
								row={row}
								index={i}
								missing={missingByExerciseId.get(row.exerciseId) ?? []}
								onRemove={() => setRows(prev => prev.filter(r => r.uid !== row.uid))}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>
			{rows.length === 0 && (
				<div className="rounded-sm border border-edge border-dashed py-2 text-center text-ink-faint text-sm">
					No exercises yet.
				</div>
			)}

			{exercisesQuery.data && (
				<ExerciseSearch
					exercises={candidates}
					unavailable={missingByExerciseId}
					suggestions={{
						label: 'least overlap in cycle',
						score: e => exerciseOverlapScore(e.muscles, overlapLoad)
					}}
					onSelect={exercise =>
						setRows(prev => [
							...prev,
							{
								uid: crypto.randomUUID(),
								exerciseId: exercise.id,
								name: exercise.name,
								type: exercise.type
							}
						])
					}
				/>
			)}

			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-[10px] text-ink-faint uppercase tracking-wide">
					targets & supersets live on the full editor
				</span>
				<SaveButton
					mutation={updateMutation}
					disabled={!(name.trim() && dirty)}
					onClick={handleSave}
					icon={SaveIcon}
					size="sm"
				/>
			</div>
		</div>
	)
}

interface DraftExerciseRowProps {
	row: DraftExercise
	index: number
	missing: readonly Equipment[]
	onRemove: () => void
}

const DraftExerciseRow: FC<DraftExerciseRowProps> = ({ row, index, missing, onRemove }) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.uid })
	const style = { transform: CSS.Translate.toString(transform), transition }

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex items-center gap-2 rounded-sm border border-edge bg-surface-1 px-2 py-1',
				isDragging && 'z-10 opacity-50'
			)}
		>
			<button
				type="button"
				className="flex cursor-grab touch-none items-center text-ink-faint hover:text-ink active:cursor-grabbing"
				{...attributes}
				{...listeners}
				aria-label="Reorder exercise"
			>
				<GripVertical className="size-4" />
			</button>
			<span className="font-mono text-ink-faint text-xs tabular-nums">{index + 1}.</span>
			<span className="min-w-0 flex-1 truncate text-ink text-sm">{row.name}</span>
			<EquipmentWarning missing={missing} />
			<Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${row.name}`}>
				<Trash2 className="size-4" />
			</Button>
		</div>
	)
}
