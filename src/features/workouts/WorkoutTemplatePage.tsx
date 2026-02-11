import type { SetMode, TrainingGoal, TypeIDString, Workout } from '@macromaxxing/db'
import { ArrowLeft, Link2, Link2Off, SaveIcon, Trash2 } from 'lucide-react'
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
	supersetGroup: number | null
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
					setMode: e.setMode ?? 'working',
					supersetGroup: e.supersetGroup
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
				setMode: e.setMode,
				supersetGroup: e.supersetGroup
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

	function toggleSuperset(idx: number) {
		// Link exercise at idx with exercise at idx+1
		const next = [...exercises]
		const a = next[idx]
		const b = next[idx + 1]
		if (!b) return

		if (a.supersetGroup !== null && a.supersetGroup === b.supersetGroup) {
			// Unlink: remove group from both (unless others share it)
			const group = a.supersetGroup
			const members = next.filter(e => e.supersetGroup === group)
			if (members.length <= 2) {
				// Only 2 in group, remove group entirely
				for (const e of next) {
					if (e.supersetGroup === group) e.supersetGroup = null
				}
			} else {
				// Split: b and everything after it in this group gets a new group
				const usedGroups = new Set(next.map(e => e.supersetGroup).filter((g): g is number => g !== null))
				let newGroup = 1
				while (usedGroups.has(newGroup)) newGroup++
				let splitting = false
				for (const e of next) {
					if (e === b) splitting = true
					if (splitting && e.supersetGroup === group) e.supersetGroup = newGroup
				}
				// If only one remains in old group, remove it
				if (next.filter(e => e.supersetGroup === group).length === 1) {
					for (const e of next) {
						if (e.supersetGroup === group) e.supersetGroup = null
					}
				}
				// If only one remains in new group, remove it
				if (next.filter(e => e.supersetGroup === newGroup).length === 1) {
					for (const e of next) {
						if (e.supersetGroup === newGroup) e.supersetGroup = null
					}
				}
			}
		} else {
			// Link: assign same group
			const existingGroup = a.supersetGroup ?? b.supersetGroup
			if (existingGroup !== null) {
				// Join existing group
				a.supersetGroup = existingGroup
				b.supersetGroup = existingGroup
			} else {
				// Create new group
				const usedGroups = new Set(next.map(e => e.supersetGroup).filter((g): g is number => g !== null))
				let newGroup = 1
				while (usedGroups.has(newGroup)) newGroup++
				a.supersetGroup = newGroup
				b.supersetGroup = newGroup
			}
		}
		setExercises(next)
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
						{trainingGoal === 'hypertrophy'
							? 'Default 3×10, dynamic rest'
							: 'Default 5×5, dynamic rest (1.5×)'}
					</p>
				</div>
			</div>

			<div className="space-y-0">
				<h2 className="mb-2 font-medium text-ink text-sm">Exercises</h2>
				{exercises.map((ex, idx) => {
					const isLinkedAbove =
						idx > 0 && ex.supersetGroup !== null && exercises[idx - 1].supersetGroup === ex.supersetGroup
					const isLinkedBelow =
						idx < exercises.length - 1 &&
						ex.supersetGroup !== null &&
						exercises[idx + 1].supersetGroup === ex.supersetGroup
					const canLink = idx < exercises.length - 1
					const isLinkedWithNext =
						canLink && ex.supersetGroup !== null && exercises[idx + 1].supersetGroup === ex.supersetGroup

					// Distinct groups get distinct label numbers
					const groupLabels = [
						...new Set(exercises.map(e => e.supersetGroup).filter((g): g is number => g !== null))
					]
					const groupLabel =
						ex.supersetGroup !== null ? `SS${groupLabels.indexOf(ex.supersetGroup) + 1}` : null

					return (
						<div key={`${ex.exerciseId}-${idx}`}>
							<TemplateExerciseRow
								exercise={ex}
								index={idx}
								total={exercises.length}
								trainingGoal={trainingGoal}
								supersetLabel={!isLinkedAbove ? groupLabel : null}
								isSuperset={ex.supersetGroup !== null}
								isFirstInGroup={!isLinkedAbove && ex.supersetGroup !== null}
								isLastInGroup={!isLinkedBelow && ex.supersetGroup !== null}
								onUpdate={updates => updateExercise(idx, updates)}
								onRemove={() => removeExercise(idx)}
								onMove={dir => moveExercise(idx, dir)}
							/>
							{canLink && (
								<div className="flex justify-center py-0.5">
									<button
										type="button"
										className={cn(
											'group flex items-center gap-1 rounded-[--radius-sm] px-1.5 py-0.5 font-mono text-[10px] transition-colors',
											isLinkedWithNext
												? 'text-accent hover:text-destructive'
												: 'text-ink-faint hover:text-accent'
										)}
										onClick={() => toggleSuperset(idx)}
									>
										{isLinkedWithNext ? (
											<>
												<Link2 className="size-3 group-hover:hidden" />
												<Link2Off className="hidden size-3 group-hover:block" />
												<span className="group-hover:hidden">superset</span>
												<span className="hidden group-hover:inline">unlink</span>
											</>
										) : (
											<>
												<Link2Off className="size-3 group-hover:hidden" />
												<Link2 className="hidden size-3 group-hover:block" />
												<span className="group-hover:hidden">superset</span>
												<span className="hidden group-hover:inline">link</span>
											</>
										)}
									</button>
								</div>
							)}
						</div>
					)
				})}

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
									setMode: exercise.type === 'compound' ? 'warmup' : 'working',
									supersetGroup: null
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
