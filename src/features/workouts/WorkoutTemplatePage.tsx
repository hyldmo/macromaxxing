import type { SetMode, TrainingGoal, TypeIDString, Workout } from '@macromaxxing/db'
import { ArrowLeft, SaveIcon, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { SaveButton } from '~/components/ui/SaveButton'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { cn } from '~/lib/cn'
import { trpc } from '~/lib/trpc'
import { ExerciseSearch } from './components/ExerciseSearch'
import { TemplateExerciseRow } from './components/TemplateExerciseRow'

export interface TemplateExercise {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	exerciseType: 'compound' | 'isolation'
	targetSets: number | null
	targetReps: number | null
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
	const [trainingGoal, setTrainingGoal] = useState<TrainingGoal>('hypertrophy')
	const [exercises, setExercises] = useState<TemplateExercise[]>([])

	useEffect(() => {
		if (workoutQuery.data) {
			setName(workoutQuery.data.name)
			setTrainingGoal(workoutQuery.data.trainingGoal as TrainingGoal)
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

	function handleSave() {
		const payload = {
			name,
			trainingGoal,
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
				<div className="space-y-1">
					<span className="text-ink-muted text-sm">Training Goal</span>
					<div className="flex">
						{(['hypertrophy', 'strength'] as const).map(goal => (
							<button
								key={goal}
								type="button"
								className={cn(
									'border border-edge px-3 py-1 text-sm capitalize first:rounded-l-[--radius-sm] last:rounded-r-[--radius-sm]',
									trainingGoal === goal
										? 'bg-accent text-white'
										: 'bg-surface-0 text-ink-faint hover:text-ink'
								)}
								onClick={() => setTrainingGoal(goal)}
							>
								{goal}
							</button>
						))}
					</div>
					<p className="text-ink-faint text-xs">
						{trainingGoal === 'hypertrophy' ? 'Default 3×10, rest 90s' : 'Default 5×5, rest 180s'}
					</p>
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
						trainingGoal={trainingGoal}
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
									targetSets: null,
									targetReps: null,
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
