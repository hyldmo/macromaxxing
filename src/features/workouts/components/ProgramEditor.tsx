import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TypeIDString } from '@macromaxxing/db'
import { GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react'
import { type FC, Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Card, CopyButton, Input, Select, Spinner, TRPCError } from '~/components/ui'
import { cn, formatProgram, formatTemplate, useDocumentTitle, useUnsavedChanges } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { collectWorkoutMuscles, computeProgramRest, findOptimalOrder } from '~/lib/workouts/programRest'
import { MuscleVolumeChip } from './MuscleChip'
import { ProgramCyclePreview } from './ProgramCyclePreview'
import { BelowMevWarning, ProgramMuscleSidebar } from './ProgramMuscleSidebar'
import { ProgramRestTransition } from './ProgramRestTransition'

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]

type WorkoutId = TypeIDString<'wkt'>

interface DraftItem {
	workoutId: WorkoutId
	name: string
}

export const ProgramEditor: FC = () => {
	const { id } = useParams<{ id: string }>()
	const navigate = useNavigate()
	const isNew = !id || id === 'new'
	useDocumentTitle(isNew ? 'New Program' : 'Edit Program')

	const utils = trpc.useUtils()
	const programQuery = trpc.workout.getProgram.useQuery({ id: id as TypeIDString<'wpr'> }, { enabled: !isNew })
	const workoutsQuery = trpc.workout.listWorkouts.useQuery()

	const [name, setName] = useState('')
	const [items, setItems] = useState<DraftItem[]>([])
	const [pickerValue, setPickerValue] = useState<string>('')

	useEffect(() => {
		if (!isNew && programQuery.data) {
			setName(programQuery.data.name)
			setItems(programQuery.data.workouts.map(w => ({ workoutId: w.id, name: w.name })))
		}
	}, [isNew, programQuery.data])

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

	const createMutation = trpc.workout.createProgram.useMutation({
		onSuccess: () => {
			utils.workout.listPrograms.invalidate()
			navigate('/plans')
		}
	})
	const updateMutation = trpc.workout.updateProgram.useMutation({
		onSuccess: () => {
			utils.workout.listPrograms.invalidate()
			utils.workout.getProgram.invalidate({ id: id as TypeIDString<'wpr'> })
			navigate('/plans')
		}
	})
	const deleteMutation = trpc.workout.deleteProgram.useMutation({
		onSuccess: () => {
			utils.workout.listPrograms.invalidate()
			utils.dashboard.summary.invalidate()
			navigate('/plans')
		}
	})

	const dirty = useMemo(() => {
		if (isNew) return name.trim() !== '' || items.length > 0
		const data = programQuery.data
		if (!data) return false
		if (name !== data.name) return true
		if (items.length !== data.workouts.length) return true
		return items.some((it, i) => it.workoutId !== data.workouts[i].id)
	}, [isNew, name, items, programQuery.data])

	const isMutating =
		createMutation.isPending ||
		createMutation.isSuccess ||
		updateMutation.isPending ||
		updateMutation.isSuccess ||
		deleteMutation.isPending ||
		deleteMutation.isSuccess
	useUnsavedChanges(dirty && !isMutating)

	const availableWorkouts = useMemo(() => {
		const used = new Set(items.map(i => i.workoutId))
		return workoutsQuery.data?.filter(w => !used.has(w.id)) ?? []
	}, [workoutsQuery.data, items])

	const resolvedItems = useMemo(() => {
		if (!workoutsQuery.data) return []
		const byId = new Map(workoutsQuery.data.map(w => [w.id, w]))
		return items.flatMap(i => {
			const w = byId.get(i.workoutId)
			return w ? [w] : []
		})
	}, [items, workoutsQuery.data])

	const restTransitions = useMemo(() => computeProgramRest(resolvedItems), [resolvedItems])

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const oldIdx = items.findIndex(i => i.workoutId === active.id)
		const newIdx = items.findIndex(i => i.workoutId === over.id)
		if (oldIdx === -1 || newIdx === -1) return
		setItems(arrayMove(items, oldIdx, newIdx))
	}

	function addWorkout(workoutId: WorkoutId) {
		const w = workoutsQuery.data?.find(w => w.id === workoutId)
		if (!w) return
		setItems([...items, { workoutId: w.id, name: w.name }])
		setPickerValue('')
	}

	function removeWorkout(workoutId: WorkoutId) {
		setItems(items.filter(i => i.workoutId !== workoutId))
	}

	function handleSave() {
		if (!name.trim()) return
		const workoutIds = items.map(i => i.workoutId)
		if (isNew) {
			createMutation.mutate({ name: name.trim(), workoutIds })
		} else {
			updateMutation.mutate({ id: id as TypeIDString<'wpr'>, name: name.trim(), workoutIds })
		}
	}

	function handleDelete() {
		if (isNew || !id) return
		if (!confirm('Delete this program? Active state will fall back to cycling all templates.')) return
		deleteMutation.mutate({ id: id as TypeIDString<'wpr'> })
	}

	function handleOptimize() {
		if (resolvedItems.length < 3 || resolvedItems.length !== items.length) return
		const order = findOptimalOrder(resolvedItems)
		setItems(order.map(i => items[i]))
	}
	const canOptimize = items.length >= 3 && resolvedItems.length === items.length

	if (!isNew && programQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}
	if (!(isNew || programQuery.data) && programQuery.error) return <TRPCError error={programQuery.error} />

	const isPending = createMutation.isPending || updateMutation.isPending
	const error = createMutation.error || updateMutation.error || deleteMutation.error

	return (
		<div className="space-y-4">
			{!isNew && programQuery.error && <TRPCError error={programQuery.error} />}
			<div className="flex items-center justify-between gap-2">
				<h1 className="font-semibold text-ink">{isNew ? 'New Program' : 'Edit Program'}</h1>
				<div className="flex items-center gap-2">
					{resolvedItems.length > 0 && (
						<CopyButton
							variant="outline"
							size="default"
							getText={() =>
								formatProgram(name.trim() || programQuery.data?.name || 'Program', resolvedItems)
							}
						>
							Copy All
						</CopyButton>
					)}
					<Button variant="ghost" onClick={() => navigate('/plans')}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!name.trim() || isPending}>
						{isPending ? <Spinner className="size-4 text-current" /> : 'Save'}
					</Button>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
				<div className="space-y-4">
					<Card className="space-y-4 p-4">
						<div className="space-y-1">
							<label htmlFor="program-name" className="font-medium text-ink-muted text-xs">
								Name
							</label>
							<Input
								id="program-name"
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder="e.g. PPL"
								autoFocus
							/>
						</div>

						<div className="space-y-2">
							<div className="flex items-baseline justify-between">
								<div className="font-medium text-ink-muted text-xs">Workouts</div>
								{items.length > 1 && (
									<div className="font-mono text-[10px] text-ink-faint uppercase tracking-wide">
										recovery hours shown between rows
									</div>
								)}
							</div>
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
								<SortableContext
									items={items.map(i => i.workoutId)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-1">
										{items.map((item, i) => {
											const workout = resolvedItems[i]
											const transition = restTransitions[i]
											const isWrap = i === items.length - 1
											return (
												<Fragment key={item.workoutId}>
													<DraggableItemRow
														index={i}
														item={item}
														workout={workout}
														onRemove={() => removeWorkout(item.workoutId)}
													/>
													{transition && items.length > 1 && (
														<ProgramRestTransition
															transition={transition}
															isWrap={isWrap}
														/>
													)}
												</Fragment>
											)
										})}
									</div>
								</SortableContext>
							</DndContext>

							{items.length === 0 && (
								<div className="rounded-sm border border-edge border-dashed py-3 text-center text-ink-faint text-sm">
									No workouts yet — add some below.
								</div>
							)}

							{availableWorkouts.length > 0 && (
								<div className="flex items-center gap-2">
									<Select<string>
										value={pickerValue}
										onChange={value => setPickerValue(value)}
										className="flex-1"
										options={[
											{ value: '', label: 'Add a workout…' },
											...availableWorkouts.map(w => ({ value: w.id, label: w.name }))
										]}
									/>
									<Button
										variant="outline"
										onClick={() => pickerValue && addWorkout(pickerValue as WorkoutId)}
										disabled={!pickerValue}
									>
										<Plus className="size-4" />
										Add
									</Button>
								</div>
							)}
						</div>

						<div className="space-y-2 border-edge border-t pt-3">
							<div className="font-medium text-ink-muted text-xs">Cycle</div>
							<ProgramCyclePreview items={items.map(i => ({ id: i.workoutId, name: i.name }))} />
						</div>
					</Card>

					<BelowMevWarning workouts={resolvedItems} />

					{error && <TRPCError error={error} />}

					{(canOptimize || !isNew) && (
						<div className="flex justify-end gap-2">
							{canOptimize && (
								<Button
									variant="outline"
									onClick={handleOptimize}
									title="Reorder workouts to minimize muscle overlap between consecutive sessions"
								>
									<Sparkles className="size-4" />
									Optimize order
								</Button>
							)}
							{!isNew && (
								<Button
									variant="destructive"
									onClick={handleDelete}
									disabled={deleteMutation.isPending}
								>
									<Trash2 className="size-4" />
									Delete program
								</Button>
							)}
						</div>
					)}
				</div>

				<aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
					<h2 className="font-medium text-ink-muted text-xs uppercase tracking-wide">Cycle coverage</h2>
					<ProgramMuscleSidebar workouts={resolvedItems} />
				</aside>
			</div>
		</div>
	)
}

interface DraggableItemRowProps {
	index: number
	item: DraftItem
	workout: WorkoutTemplate | undefined
	onRemove: () => void
}

const DraggableItemRow: FC<DraggableItemRowProps> = ({ index, item, workout, onRemove }) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.workoutId })
	const style = { transform: CSS.Translate.toString(transform), transition }

	const exerciseNames = workout?.exercises.map(e => e.exercise.name) ?? []
	const muscles = useMemo(() => (workout ? collectWorkoutMuscles(workout) : []), [workout])
	const maxSets = muscles.reduce((m, x) => Math.max(m, x.effectiveSets), 0)

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex items-stretch gap-2 rounded-sm border border-edge bg-surface-1 px-2 py-1.5',
				isDragging && 'z-10 opacity-50'
			)}
		>
			<button
				type="button"
				className="flex cursor-grab touch-none items-center text-ink-faint hover:text-ink active:cursor-grabbing"
				{...attributes}
				{...listeners}
				aria-label="Reorder"
			>
				<GripVertical className="size-4" />
			</button>
			<span className="flex items-center font-mono text-ink-faint text-xs tabular-nums">{index + 1}.</span>
			<div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
				<Link
					to={`/workouts/${item.workoutId}`}
					className="truncate font-medium text-ink text-sm hover:text-accent"
				>
					{item.name}
				</Link>
				{exerciseNames.length > 0 && (
					<div className="truncate font-mono text-[11px] text-ink-faint" title={exerciseNames.join(' · ')}>
						{exerciseNames.join(' · ')}
					</div>
				)}
				{muscles.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{muscles.map(m => (
							<MuscleVolumeChip
								key={m.muscleGroup}
								muscleGroup={m.muscleGroup}
								effectiveSets={m.effectiveSets}
								maxSets={maxSets}
							/>
						))}
					</div>
				)}
			</div>
			{workout && (
				<CopyButton
					variant="ghost"
					size="icon"
					getText={() => formatTemplate(workout)}
					aria-label={`Copy ${item.name}`}
					className="self-start"
				/>
			)}
			<Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove workout" className="self-start">
				<Trash2 className="size-4" />
			</Button>
		</div>
	)
}
