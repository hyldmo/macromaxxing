import type { SetMode, TypeIDString, Workout } from '@macromaxxing/db'
import { ArrowLeft, GripVertical, SaveIcon, Trash2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { NumberInput } from '~/components/ui/NumberInput'
import { SaveButton } from '~/components/ui/SaveButton'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'
import { ExerciseSearch } from './components/ExerciseSearch'
import { WorkoutModes } from './WorkoutMode'

interface TemplateExercise {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	exerciseType: 'compound' | 'isolation'
	targetSets: number
	targetReps: number
	targetWeight: number | null
	setMode: SetMode
}

export function WorkoutTemplatePage() {
	const { workoutId } = useParams<{ workoutId: Workout['id'] | 'new' }>()
	const navigate = useNavigate()
	const isEditing = !!workoutId && workoutId !== 'new'
	const utils = trpc.useUtils()

	const workoutQuery = trpc.workout.getWorkout.useQuery(
		{ id: workoutId as TypeIDString<'wkt'> },
		{ enabled: isEditing }
	)
	const exercisesQuery = trpc.workout.listExercises.useQuery()

	const [name, setName] = useState('')
	const [exercises, setExercises] = useState<TemplateExercise[]>([])

	useEffect(() => {
		if (workoutQuery.data) {
			setName(workoutQuery.data.name)
			setExercises(
				workoutQuery.data.exercises.map(e => ({
					exerciseId: e.exerciseId,
					exerciseName: e.exercise.name,
					exerciseType: e.exercise.type,
					targetSets: e.targetSets,
					targetReps: e.targetReps,
					targetWeight: e.targetWeight,
					setMode: e.setMode ?? 'working'
				}))
			)
		}
	}, [workoutQuery.data])

	const createMutation = trpc.workout.createWorkout.useMutation({
		onSuccess: () => {
			utils.workout.listWorkouts.invalidate()
		}
	})
	const updateMutation = trpc.workout.updateWorkout.useMutation({
		onSuccess: () => {
			utils.workout.listWorkouts.invalidate()
			utils.workout.getWorkout.invalidate({ id: workoutId as TypeIDString<'wkt'> })
		}
	})
	const deleteMutation = trpc.workout.deleteWorkout.useMutation({
		onSuccess: () => {
			utils.workout.listWorkouts.invalidate()
			navigate('/workouts')
		}
	})

	const saving = createMutation.isPending || updateMutation.isPending

	function handleSave() {
		const payload = {
			name,
			exercises: exercises.map(e => ({
				exerciseId: e.exerciseId,
				targetSets: e.targetSets,
				targetReps: e.targetReps,
				targetWeight: e.targetWeight,
				setMode: e.setMode
			}))
		}
		if (isEditing) {
			updateMutation.mutate({ id: workoutId as TypeIDString<'wkt'>, ...payload })
		} else {
			createMutation.mutate(payload)
		}
	}

	function updateExercise(idx: number, updates: Partial<TemplateExercise>) {
		setExercises(prev => prev.map((e, i) => (i === idx ? { ...e, ...updates } : e)))
	}

	function removeExercise(idx: number) {
		setExercises(prev => prev.filter((_, i) => i !== idx))
	}

	function moveExercise(idx: number, dir: -1 | 1) {
		const target = idx + dir
		if (target < 0 || target >= exercises.length) return
		setExercises(prev => {
			const next = [...prev]
			;[next[idx], next[target]] = [next[target], next[idx]]
			return next
		})
	}

	if (isEditing && workoutQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}
	if (isEditing && workoutQuery.error) return <TRPCError error={workoutQuery.error} />

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Link to="/workouts" className="text-ink-muted hover:text-ink">
					<ArrowLeft className="size-5" />
				</Link>
				<h1 className="font-semibold text-ink">{isEditing ? 'Edit Workout' : 'New Workout'}</h1>
				{isEditing && (
					<Button
						variant="ghost"
						size="icon"
						className="ml-auto text-ink-faint hover:text-destructive"
						onClick={() => deleteMutation.mutate({ id: workoutId as TypeIDString<'wkt'> })}
					>
						<Trash2 className="size-4" />
					</Button>
				)}
			</div>

			<div className="space-y-3">
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="workout-name">
						Name
					</label>
					<Input
						id="workout-name"
						placeholder="Push A, Pull B, Upper, Lower..."
						value={name}
						onChange={e => setName(e.target.value)}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<h2 className="font-medium text-ink text-sm">Exercises</h2>
				{exercises.map((ex, idx) => (
					<TemplateExerciseRow
						key={`${ex.exerciseId}-${idx}`}
						exercise={ex}
						index={idx}
						total={exercises.length}
						onUpdate={updates => updateExercise(idx, updates)}
						onRemove={() => removeExercise(idx)}
						onMove={dir => moveExercise(idx, dir)}
					/>
				))}

				{exercisesQuery.data && (
					<ExerciseSearch
						exercises={exercisesQuery.data}
						onSelect={exercise => {
							setExercises(prev => [
								...prev,
								{
									exerciseId: exercise.id,
									exerciseName: exercise.name,
									exerciseType: exercise.type,
									targetSets: 3,
									targetReps: 8,
									targetWeight: null,
									setMode: exercise.type === 'compound' ? 'warmup' : 'working'
								}
							])
						}}
					/>
				)}
			</div>

			{(createMutation.isError || updateMutation.isError) && (
				<TRPCError error={createMutation.error ?? updateMutation.error!} />
			)}

			<SaveButton
				mutation={isEditing ? updateMutation : createMutation}
				disabled={!name || exercises.length === 0}
				onClick={handleSave}
				pendingText={isEditing ? 'Saving...' : 'Creating...'}
				icon={SaveIcon}
			>
				{isEditing ? 'Save Changes' : 'Create Workout'}
			</SaveButton>
		</div>
	)
}

interface TemplateExerciseRowProps {
	exercise: TemplateExercise
	index: number
	total: number
	onUpdate: (updates: Partial<TemplateExercise>) => void
	onRemove: () => void
	onMove: (dir: -1 | 1) => void
}

const TemplateExerciseRow: FC<TemplateExerciseRowProps> = ({ exercise, index, total, onUpdate, onRemove, onMove }) => (
	<div className="flex items-center gap-2 rounded-[--radius-sm] border border-edge bg-surface-1 px-2 py-1.5">
		<div className="flex flex-col">
			<button
				type="button"
				className="text-ink-faint hover:text-ink disabled:invisible"
				disabled={index === 0}
				onClick={() => onMove(-1)}
			>
				<GripVertical className="size-3" />
			</button>
			<button
				type="button"
				className="text-ink-faint hover:text-ink disabled:invisible"
				disabled={index === total - 1}
				onClick={() => onMove(1)}
			>
				<GripVertical className="size-3" />
			</button>
		</div>
		<span className="min-w-0 flex-1 truncate text-ink text-sm">{exercise.exerciseName}</span>
		<WorkoutModes value={exercise.setMode} onChange={mode => onUpdate({ setMode: mode })} />
		<NumberInput
			className="w-14"
			value={exercise.targetSets || ''}
			onChange={e => {
				const v = Number.parseInt(e.target.value, 10)
				onUpdate({ targetSets: Number.isNaN(v) ? 0 : v })
			}}
			min={1}
			step={1}
		/>
		<span className="text-ink-faint text-xs">sets</span>
		<span className="text-ink-faint text-xs">×</span>
		<NumberInput
			className="w-14"
			value={exercise.targetReps || ''}
			onChange={e => {
				const v = Number.parseInt(e.target.value, 10)
				onUpdate({ targetReps: Number.isNaN(v) ? 0 : v })
			}}
			min={1}
			step={1}
		/>
		<span className="text-ink-faint text-xs">reps</span>
		<span className="text-ink-faint text-xs">@</span>
		<NumberInput
			className="w-20"
			value={exercise.targetWeight ?? ''}
			placeholder="kg"
			onChange={e => {
				const v = Number.parseFloat(e.target.value)
				onUpdate({ targetWeight: Number.isNaN(v) ? null : v })
			}}
			min={0}
			step={0.5}
		/>
		<Button variant="ghost" size="icon" className="size-6 text-ink-faint hover:text-destructive" onClick={onRemove}>
			<Trash2 className="size-3" />
		</Button>
	</div>
)
