import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { TypeIDString } from '@macromaxxing/db'
import { Dumbbell, Plus, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Card, CopyButton, LinkButton, Spinner, TRPCError } from '~/components/ui'
import { ImportDialog } from '~/features/workouts/components/ImportDialog'
import { SessionCard } from '~/features/workouts/components/SessionCard'
import { SortableWorkoutCard } from '~/features/workouts/components/SortableWorkoutCard'
import { WorkoutCard } from '~/features/workouts/components/WorkoutCard'
import { WorkoutGroupHeader } from '~/features/workouts/components/WorkoutGroupHeader'
import { WorkoutProgramGroup } from '~/features/workouts/components/WorkoutProgramGroup'
import { pickNextWorkout, prefetchRoute, useDocumentTitle } from '~/lib'
import { trpc } from '~/lib/trpc'
import { formatTemplate } from '~/lib/workouts/export'

export const clientLoader = () =>
	prefetchRoute(utils => [
		utils.workout.listWorkouts.ensureData(),
		utils.workout.listSessions.ensureData(),
		utils.workout.listPrograms.ensureData(),
		utils.dashboard.summary.ensureData()
	])

export default function WorkoutListPage() {
	useDocumentTitle('Workouts')
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const workoutsQuery = trpc.workout.listWorkouts.useQuery()
	const sessionsQuery = trpc.workout.listSessions.useQuery()
	const programsQuery = trpc.workout.listPrograms.useQuery()
	const summaryQuery = trpc.dashboard.summary.useQuery()
	const utils = trpc.useUtils()
	const activeProgram = summaryQuery.data?.activeProgram ?? null

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

	const workouts = workoutsQuery.data
	const programs = programsQuery.data
	const sessions = sessionsQuery.data ?? []

	const { activeGroup, otherGroups, unassigned } = useMemo(() => {
		if (!(workouts && programs)) return { activeGroup: null, otherGroups: [], unassigned: [] }

		const workoutsById = new Map(workouts.map(w => [w.id, w]))
		const assignedIds = new Set<TypeIDString<'wkt'>>()
		const groups = programs.map(p => {
			const items = p.workouts.flatMap(w => {
				const t = workoutsById.get(w.id)
				if (!t) return []
				assignedIds.add(t.id)
				return [t]
			})
			return { program: p, workouts: items }
		})

		const activeId = activeProgram?.id
		const active = activeId ? (groups.find(g => g.program.id === activeId) ?? null) : null
		const others = groups.filter(g => g.program.id !== active?.program.id)
		const loose = workouts.filter(w => !assignedIds.has(w.id))
		return { activeGroup: active, otherGroups: others, unassigned: loose }
	}, [workouts, programs, activeProgram])

	const upNext = useMemo(() => {
		if (!(activeGroup && activeProgram)) return null
		const result = pickNextWorkout(
			activeGroup.workouts.map(w => ({ id: w.id })),
			sessions.map(s => ({ workoutId: s.workoutId, completedAt: s.completedAt })),
			activeProgram
		)
		return result.kind === 'program' ? { id: result.template.id, day: result.day, total: result.total } : null
	}, [activeGroup, activeProgram, sessions])

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id || !workouts) return

		const oldIndex = workouts.findIndex(w => w.id === active.id)
		const newIndex = workouts.findIndex(w => w.id === over.id)
		if (oldIndex === -1 || newIndex === -1) return

		const reordered = arrayMove(workouts, oldIndex, newIndex)
		reorderMutation.mutate({ ids: reordered.map(w => w.id) })
	}

	function handleStartSession(workoutId: TypeIDString<'wkt'>) {
		createSession.mutate({ workoutId })
	}

	const hasGroups = programs && programs.length > 0
	const isLoading = workoutsQuery.isLoading || programsQuery.isLoading
	const error = workoutsQuery.error ?? programsQuery.error

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<h1 className="font-semibold text-ink">Workouts</h1>
				<div className="flex flex-wrap items-center gap-2">
					<LinkButton to="/exercises" variant="outline">
						<Dumbbell className="size-4" />
						Exercises
					</LinkButton>
					{workouts && workouts.length > 0 && (
						<CopyButton
							variant="outline"
							size="default"
							getText={() => workouts.map(w => formatTemplate(w)).join('\n\n---\n\n')}
						>
							Copy All
						</CopyButton>
					)}
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

			{isLoading ? (
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			) : error ? (
				<TRPCError error={error} />
			) : !workouts || workouts.length === 0 ? (
				<Card className="py-6 text-center text-ink-faint">
					No workout templates yet. Create your first one!
				</Card>
			) : !hasGroups ? (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={workouts.map(w => w.id)} strategy={verticalListSortingStrategy}>
						<div className="space-y-1.5">
							{workouts.map((workout, i) => (
								<SortableWorkoutCard
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
				<div className="space-y-6">
					{activeGroup && (
						<WorkoutProgramGroup
							programId={activeGroup.program.id}
							programName={activeGroup.program.name}
							workouts={activeGroup.workouts}
							sessions={sessions}
							isActive={true}
							upNextId={upNext?.id ?? null}
							day={upNext?.day}
							total={upNext?.total}
							onStartSession={handleStartSession}
							isPending={createSession.isPending}
						/>
					)}
					{otherGroups.map(g => (
						<WorkoutProgramGroup
							key={g.program.id}
							programId={g.program.id}
							programName={g.program.name}
							workouts={g.workouts}
							sessions={sessions}
							isActive={false}
							onStartSession={handleStartSession}
							isPending={createSession.isPending}
						/>
					))}
					{unassigned.length > 0 && (
						<section className="space-y-2">
							<WorkoutGroupHeader
								title="Unassigned"
								status={
									<span className="font-mono text-[10px] text-ink-faint uppercase tracking-wide">
										{unassigned.length} workout{unassigned.length === 1 ? '' : 's'}
									</span>
								}
								meta="Not part of any program"
							/>
							<div className="space-y-1.5">
								{unassigned.map(workout => (
									<WorkoutCard
										key={workout.id}
										workout={workout}
										onStartSession={handleStartSession}
										isPending={createSession.isPending}
										variant="compact"
									/>
								))}
							</div>
						</section>
					)}
				</div>
			)}

			{sessionsQuery.data && sessionsQuery.data.length > 0 && (
				<div className="space-y-2">
					<h2 className="font-medium text-ink text-sm">Recent Sessions</h2>
					<div className="space-y-1.5">
						{sessionsQuery.data.slice(0, 5).map(session => (
							<SessionCard key={session.id} session={session} />
						))}
					</div>
				</div>
			)}

			<ImportDialog open={showImport} onClose={() => setShowImport(false)} />
		</div>
	)
}
