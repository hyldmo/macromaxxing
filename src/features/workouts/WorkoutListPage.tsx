import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { TypeIDString } from '@macromaxxing/db'
import { Plus, TrendingUp, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, LinkButton, Spinner, TRPCError } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useDocumentTitle } from '~/lib/useDocumentTitle'
import { ImportDialog } from './components/ImportDialog'
import { MuscleHeatGrid } from './components/MuscleHeatGrid'
import { SessionCard } from './components/SessionCard'
import { WorkoutCard } from './components/WorkoutCard'

export function WorkoutListPage() {
	useDocumentTitle('Workouts')
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const workoutsQuery = trpc.workout.listWorkouts.useQuery()
	const sessionsQuery = trpc.workout.listSessions.useQuery()
	const utils = trpc.useUtils()

	const createSession = trpc.workout.createSession.useMutation({
		onSuccess: session => {
			utils.workout.listSessions.invalidate()
			navigate(`/workouts/sessions/${session.id}`)
		}
	})

	const reorderMutation = trpc.workout.reorderWorkouts.useMutation({
		onMutate: async ({ ids }) => {
			await utils.workout.listWorkouts.cancel()
			const previous = utils.workout.listWorkouts.getData()
			if (previous) {
				const byId = new Map(previous.map(w => [w.id, w]))
				utils.workout.listWorkouts.setData(undefined, ids.map(id => byId.get(id)!).filter(Boolean))
			}
			return { previous }
		},
		onError: (_err, _input, context) => {
			if (context?.previous) utils.workout.listWorkouts.setData(undefined, context.previous)
		},
		onSettled: () => utils.workout.listWorkouts.invalidate()
	})

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id || !workoutsQuery.data) return

		const oldIndex = workoutsQuery.data.findIndex(w => w.id === active.id)
		const newIndex = workoutsQuery.data.findIndex(w => w.id === over.id)
		if (oldIndex === -1 || newIndex === -1) return

		const reordered = arrayMove(workoutsQuery.data, oldIndex, newIndex)
		reorderMutation.mutate({ ids: reordered.map(w => w.id) })
	}

	function handleStartSession(workoutId: TypeIDString<'wkt'>) {
		createSession.mutate({ workoutId })
	}

	return (
		<div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
			<div className="flex-1 space-y-4">
				<div className="flex items-center justify-between gap-2">
					<h1 className="font-semibold text-ink">Workouts</h1>
					<div className="flex items-center gap-2">
						<LinkButton to="/workouts/progression" variant="outline">
							<TrendingUp className="size-4" />
							Progression
						</LinkButton>
						<Button variant="outline" onClick={() => setShowImport(true)}>
							<Upload className="size-4" />
							Import
						</Button>
						<LinkButton to="/workouts/new">
							<Plus className="size-4" />
							New Workout
						</LinkButton>
					</div>
				</div>

				{workoutsQuery.isLoading ? (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				) : workoutsQuery.error ? (
					<TRPCError error={workoutsQuery.error} />
				) : workoutsQuery.data && workoutsQuery.data.length > 0 ? (
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext
							items={workoutsQuery.data.map(w => w.id)}
							strategy={verticalListSortingStrategy}
						>
							<div className="space-y-1.5">
								{workoutsQuery.data.map((workout, i) => (
									<WorkoutCard
										key={workout.id}
										label={`${i + 1}. ${workout.name}`}
										workout={workout}
										onStartSession={handleStartSession}
										isPending={createSession.isPending}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				) : (
					<Card className="py-6 text-center text-ink-faint">
						No workout templates yet. Create your first one!
					</Card>
				)}

				{sessionsQuery.data && (
					<div className="space-y-2">
						<h2 className="font-medium text-ink text-sm">Recent Sessions</h2>
						<div className="space-y-1.5">
							{sessionsQuery.data.length > 0 ? (
								sessionsQuery.data
									.slice(0, 5)
									.map(session => <SessionCard key={session.id} session={session} />)
							) : (
								<Card className="py-6 text-center text-ink-faint">
									No sessions yet. Start a new one!
								</Card>
							)}
						</div>
					</div>
				)}
			</div>

			<div className="lg:sticky lg:top-4 lg:self-start">
				<MuscleHeatGrid />
			</div>

			<ImportDialog open={showImport} onClose={() => setShowImport(false)} />
		</div>
	)
}
