import type { TypeIDString } from '@macromaxxing/db'
import { ArrowLeft, Check, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '~/components/ui'
import { Button } from '~/components/ui/Button'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'
import { ExerciseSearch } from './components/ExerciseSearch'
import { ExerciseSetForm } from './components/ExerciseSetForm'
import { ImportDialog } from './components/ImportDialog'
import { SessionReview } from './components/SessionReview'
import { totalVolume } from './utils/formulas'

export function WorkoutSessionPage() {
	const { sessionId, workoutId } = useParams<{ sessionId?: string; workoutId?: string }>()
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const [showReview, setShowReview] = useState(false)
	const utils = trpc.useUtils()

	// If coming from /workouts/:workoutId/session, create a new session
	const createSession = trpc.workout.createSession.useMutation({
		onSuccess: session => {
			utils.workout.listSessions.invalidate()
			navigate(`/workouts/sessions/${session.id}`, { replace: true })
		}
	})

	const completeLegacy = trpc.workout.completeSession.useMutation({
		onSuccess: () => {
			utils.workout.getSession.invalidate({ id: effectiveSessionId! })
			utils.workout.listSessions.invalidate()
		}
	})

	// Auto-create session if we came from template route
	const isCreating = !!workoutId && !sessionId
	const effectiveSessionId = sessionId as TypeIDString<'wks'> | undefined

	// Create session on mount if needed (use ref to prevent double-fire in strict mode)
	const didCreate = useRef(false)
	useEffect(() => {
		if (isCreating && !didCreate.current) {
			didCreate.current = true
			createSession.mutate({ workoutId: workoutId as TypeIDString<'wkt'> })
		}
	}, [isCreating, createSession, workoutId])

	const sessionQuery = trpc.workout.getSession.useQuery(
		{ id: effectiveSessionId! },
		{ enabled: !!effectiveSessionId }
	)
	const exercisesQuery = trpc.workout.listExercises.useQuery()

	const addSetMutation = trpc.workout.addSet.useMutation({
		onSuccess: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})
	const updateSetMutation = trpc.workout.updateSet.useMutation({
		onSuccess: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})
	const removeSetMutation = trpc.workout.removeSet.useMutation({
		onSuccess: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})
	const deleteSessionMutation = trpc.workout.deleteSession.useMutation({
		onSuccess: () => {
			utils.workout.listSessions.invalidate()
			navigate('/workouts')
		}
	})

	type SessionLog = NonNullable<typeof sessionQuery.data>['logs'][number]
	type ExerciseGroup = { exercise: SessionLog['exercise']; logs: SessionLog[] }

	// Group logs by exercise, preserving template order
	const { exerciseGroups, plannedSetsMap, extraExercises } = useMemo<{
		exerciseGroups: ExerciseGroup[]
		plannedSetsMap: Map<string, Array<{ setNumber: number; weightKg: number | null; reps: number }>>
		extraExercises: ExerciseGroup[]
	}>(() => {
		if (!sessionQuery.data) return { exerciseGroups: [], plannedSetsMap: new Map(), extraExercises: [] }

		const template = sessionQuery.data.workout
		const logsByExercise = new Map<string, ExerciseGroup>()

		for (const log of sessionQuery.data.logs) {
			const existing = logsByExercise.get(log.exerciseId)
			if (existing) {
				existing.logs.push(log)
			} else {
				logsByExercise.set(log.exerciseId, { exercise: log.exercise, logs: [log] })
			}
		}

		// Build planned sets from template
		const planned = new Map<string, Array<{ setNumber: number; weightKg: number | null; reps: number }>>()
		const templateExerciseIds = new Set<string>()

		if (template) {
			for (const we of template.exercises) {
				templateExerciseIds.add(we.exerciseId)
				const sets = []
				for (let i = 1; i <= we.targetSets; i++) {
					sets.push({ setNumber: i, weightKg: we.targetWeight, reps: we.targetReps })
				}
				planned.set(we.exerciseId, sets)
			}
		}

		// Order: template exercises first, then extra logged exercises
		const groups: ExerciseGroup[] = []
		const extras: ExerciseGroup[] = []

		if (template) {
			for (const we of template.exercises) {
				const logged = logsByExercise.get(we.exerciseId)
				groups.push({
					exercise: logged?.exercise ?? we.exercise,
					logs: logged?.logs ?? []
				})
			}
		}

		// Extra exercises not in template
		for (const [exerciseId, data] of logsByExercise) {
			if (!templateExerciseIds.has(exerciseId)) {
				groups.push(data)
				extras.push(data)
			}
		}

		return { exerciseGroups: groups, plannedSetsMap: planned, extraExercises: extras }
	}, [sessionQuery.data])

	const session = sessionQuery.data
	const vol = session ? totalVolume(session.logs) : 0
	const isCompleted = !!session?.completedAt

	if (isCreating || sessionQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (sessionQuery.error) return <TRPCError error={sessionQuery.error} />
	if (createSession.error) return <TRPCError error={createSession.error} />
	if (!session) return null

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<Link to="/workouts" className="text-ink-muted hover:text-ink">
					<ArrowLeft className="size-5" />
				</Link>
				<div className="min-w-0 flex-1">
					<h1 className="font-semibold text-ink">{session.name ?? 'Workout Session'}</h1>
					<div className="font-mono text-ink-muted text-xs tabular-nums">
						{formatDate(session.startedAt)} · {exerciseGroups.length} exercises · {session.logs.length} sets
						· {(vol / 1000).toFixed(1)}k vol
						{isCompleted && (
							<span className="ml-2 rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
								completed
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					{!isCompleted && (
						<>
							<Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
								<Upload className="size-3.5" />
								Import
							</Button>
							<Button
								size="sm"
								onClick={() => {
									if (session.workout) {
										setShowReview(true)
									} else {
										completeLegacy.mutate({ id: session.id })
									}
								}}
								disabled={session.logs.length === 0 || completeLegacy.isPending}
							>
								<Check className="size-3.5" />
								Complete
							</Button>
						</>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="text-ink-faint hover:text-destructive"
						onClick={() => deleteSessionMutation.mutate({ id: session.id })}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</div>

			{!isCompleted && exercisesQuery.data && (
				<ExerciseSearch
					exercises={exercisesQuery.data}
					onSelect={exercise => {
						addSetMutation.mutate({
							sessionId: session.id,
							exerciseId: exercise.id,
							weightKg: 0,
							reps: 0,
							setType: 'working'
						})
					}}
				/>
			)}

			<div className="space-y-2">
				{exerciseGroups.map(({ exercise, logs }) => (
					<ExerciseSetForm
						key={exercise.id}
						exercise={exercise}
						logs={logs}
						plannedSets={plannedSetsMap.get(exercise.id)}
						readOnly={isCompleted}
						onAddSet={data =>
							addSetMutation.mutate({
								sessionId: session.id,
								exerciseId: data.exerciseId as TypeIDString<'exc'>,
								weightKg: data.weightKg,
								reps: data.reps,
								setType: data.setType
							})
						}
						onUpdateSet={(logId, updates) =>
							updateSetMutation.mutate({
								id: logId as TypeIDString<'wkl'>,
								...updates
							})
						}
						onRemoveSet={logId => removeSetMutation.mutate({ id: logId as TypeIDString<'wkl'> })}
					/>
				))}
			</div>

			{session.logs.length === 0 && exerciseGroups.length === 0 && (
				<Card className="py-8 text-center text-ink-faint text-sm">
					Search and add exercises above to start logging sets.
				</Card>
			)}

			<ImportDialog
				open={showImport}
				onClose={() => setShowImport(false)}
				mode="sets"
				sessionId={session.id}
				workoutId={session.workoutId}
				onImported={() => utils.workout.getSession.invalidate({ id: session.id })}
			/>

			{showReview && session.workout && (
				<SessionReview
					session={session}
					template={session.workout}
					extraExercises={extraExercises.map((eg: ExerciseGroup) => ({
						exerciseId: eg.exercise.id as TypeIDString<'exc'>,
						exerciseName: eg.exercise.name,
						logs: eg.logs
					}))}
					onClose={() => setShowReview(false)}
				/>
			)}
		</div>
	)
}

function formatDate(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
