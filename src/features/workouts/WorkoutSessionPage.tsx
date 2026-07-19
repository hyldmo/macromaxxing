import {
	type Equipment,
	type Exercise,
	equipmentSet,
	formatEquipmentList,
	type Location,
	missingEquipment,
	type SetType,
	type TrainingGoal,
	type Workout,
	type WorkoutSession
} from '@macromaxxing/db'
import { AlertTriangle, ArrowLeft, Check, MapPin, Timer, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router'
import { Button, Card, CopyButton, LinkButton, Select, Spinner, TRPCError } from '~/components/ui'
import {
	buildSessionPlanFromSession,
	calculateRest,
	estimateReplacementWeight,
	formatSession,
	type RenderItem,
	sessionPlanRows,
	TRAINING_DEFAULTS,
	totalVolume,
	useDocumentTitle
} from '~/lib'
import { trpc } from '~/lib/trpc'
import { ExerciseReplaceModal } from './components/ExerciseReplaceModal'
import { ExerciseSearch } from './components/ExerciseSearch'
import { ExerciseSetForm } from './components/ExerciseSetForm'
import { ImportDialog } from './components/ImportDialog'
import { SessionReview } from './components/SessionReview'
import { SessionSummary } from './components/SessionSummary'
import { SupersetForm } from './components/SupersetForm'
import { useSessionSets } from './hooks/useSessionSets'
import { useWorkoutSessionStore } from './store'

export function WorkoutSessionPage() {
	const { sessionId, workoutId } = useParams<{ sessionId?: WorkoutSession['id']; workoutId?: Workout['id'] }>()
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const [showReview, setShowReview] = useState(false)
	const storeSetSession = useWorkoutSessionStore(s => s.setSession)
	const storeReset = useWorkoutSessionStore(s => s.reset)
	const storeRecordTransition = useWorkoutSessionStore(s => s.recordTransition)
	const storeStartRest = useWorkoutSessionStore(s => s.startRest)
	const storeSessionStartedAt = useWorkoutSessionStore(s => s.sessionStartedAt)
	const sessionRef = useRef<{ id: string; hasLogs: boolean; completed: boolean; deleted: boolean } | null>(null)
	const [replaceExerciseId, setReplaceExerciseId] = useState<Exercise['id'] | null>(null)
	const utils = trpc.useUtils()

	// If coming from /workouts/:workoutId/session, create a new session
	const createSession = trpc.workout.createSession.useMutation({
		onSuccess: session => {
			utils.workout.listSessions.invalidate()
			navigate(`/workouts/sessions/${session.id}`, { replace: true })
		}
	})

	const completeSession = trpc.workout.completeSession.useMutation({
		onMutate: () => {
			if (sessionRef.current) sessionRef.current.completed = true
		},
		onSuccess: () => {
			storeReset()
			utils.workout.getSession.invalidate({ id: effectiveSessionId! })
			utils.workout.listSessions.invalidate()
		}
	})

	// Auto-create session if we came from template route
	const isCreating = !!workoutId && !sessionId
	const effectiveSessionId = sessionId

	// Create session on mount if needed (use ref to prevent double-fire in strict mode)
	const didCreate = useRef(false)
	useEffect(() => {
		if (isCreating && !didCreate.current) {
			didCreate.current = true
			createSession.mutate({ workoutId: workoutId })
		}
	}, [isCreating, createSession, workoutId])

	const sessionQuery = trpc.workout.getSession.useQuery(
		{ id: effectiveSessionId! },
		{ enabled: !!effectiveSessionId }
	)

	// Keep cleanup ref in sync with latest session data
	useEffect(() => {
		if (sessionQuery.data) {
			sessionRef.current = {
				id: sessionQuery.data.id,
				hasLogs: sessionQuery.data.logs.length > 0,
				completed: !!sessionQuery.data.completedAt,
				deleted: sessionRef.current?.deleted ?? false
			}
		}
	}, [sessionQuery.data])

	// Auto-delete empty sessions on unmount (navigating away without logging any sets)
	// biome-ignore lint/suspicious/noEmptyBlockStatements: initialized on next line
	const cleanupRef = useRef(() => {})
	cleanupRef.current = () => {
		const state = sessionRef.current
		if (state && !state.hasLogs && !state.completed && !state.deleted) {
			state.deleted = true
			storeReset()
			utils.workout.listSessions.invalidate()
			fetch('/api/trpc/workout.deleteSession', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ json: { id: state.id } }),
				keepalive: true
			})
		}
	}
	useEffect(() => {
		const onBeforeUnload = () => cleanupRef.current()
		window.addEventListener('beforeunload', onBeforeUnload)
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload)
			cleanupRef.current()
		}
	}, [])

	// Signal rest timer that a session is active
	const isCompleteSession = !!sessionQuery.data?.completedAt
	useEffect(() => {
		if (sessionQuery.data && !isCompleteSession) {
			storeSetSession({ id: sessionQuery.data.id, startedAt: sessionQuery.data.startedAt })
		} else if (isCompleteSession && useWorkoutSessionStore.getState().sessionId === sessionQuery.data?.id) {
			// Only reset when the completed session is the one the store tracks —
			// viewing an old completed session must not kill another session's timers
			storeReset()
		}
	}, [sessionQuery.data, isCompleteSession, storeSetSession, storeReset])

	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const standardsQuery = trpc.workout.listStandards.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const locationsQuery = trpc.workout.listLocations.useQuery()
	const bodyWeightKg = profileQuery.data?.weightKg ?? null

	const { addSet, updateSet, removeSet } = useSessionSets(effectiveSessionId)

	const updatePlannedExercise = trpc.workout.updatePlannedExercise.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: variables.sessionId })
			const previous = utils.workout.getSession.getData({ id: variables.sessionId })
			if (previous) {
				utils.workout.getSession.setData(
					{ id: variables.sessionId },
					{
						...previous,
						plannedExercises: previous.plannedExercises.map(pe =>
							pe.exerciseId === variables.exerciseId
								? {
										...pe,
										...(variables.setMode !== undefined && { setMode: variables.setMode }),
										...(variables.trainingGoal !== undefined && {
											trainingGoal: variables.trainingGoal ?? null
										})
									}
								: pe
						)
					}
				)
			}
			return { previous }
		},
		onError: (_err, variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: variables.sessionId }, context.previous)
			}
		},
		onSettled: (_data, _err, variables) => utils.workout.getSession.invalidate({ id: variables.sessionId })
	})

	const replaceExerciseMutation = trpc.workout.replaceSessionExercise.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: variables.sessionId })
			const previous = utils.workout.getSession.getData({ id: variables.sessionId })
			const replacement = exercisesQuery.data?.find(e => e.id === variables.newExerciseId)
			if (previous && replacement) {
				utils.workout.getSession.setData(
					{ id: variables.sessionId },
					{
						...previous,
						logs: previous.logs.map(log =>
							log.exerciseId === variables.oldExerciseId
								? { ...log, exerciseId: variables.newExerciseId, exercise: replacement }
								: log
						),
						plannedExercises: previous.plannedExercises.map(pe =>
							pe.exerciseId === variables.oldExerciseId
								? {
										...pe,
										exerciseId: variables.newExerciseId,
										exercise: replacement,
										targetSets: null,
										targetReps: null,
										targetWeight: variables.targetWeight ?? null
									}
								: pe
						)
					}
				)
			}
			return { previous }
		},
		onError: (_err, variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: variables.sessionId }, context.previous)
			}
		},
		onSettled: (_data, _err, variables) => utils.workout.getSession.invalidate({ id: variables.sessionId })
	})

	// Session-scoped location change (traveling, template assumes another gym) —
	// optimistic so the availability warnings recompute instantly
	const updateSessionLocation = trpc.workout.updateSessionLocation.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: variables.id })
			const previous = utils.workout.getSession.getData({ id: variables.id })
			if (previous) {
				const location = variables.locationId
					? (locationsQuery.data?.find(l => l.id === variables.locationId) ?? null)
					: null
				utils.workout.getSession.setData(
					{ id: variables.id },
					{ ...previous, locationId: variables.locationId, location }
				)
			}
			return { previous }
		},
		onError: (_err, variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: variables.id }, context.previous)
			}
		},
		onSettled: (_data, _err, variables) => utils.workout.getSession.invalidate({ id: variables.id })
	})

	const deleteSessionMutation = trpc.workout.deleteSession.useMutation({
		onMutate: () => {
			if (sessionRef.current) sessionRef.current.deleted = true
		},
		onSuccess: () => {
			storeReset()
			utils.workout.listSessions.invalidate()
			navigate('/workouts')
		}
	})

	const session = sessionQuery.data
	const goal: TrainingGoal = session?.workout?.trainingGoal ?? 'hypertrophy'

	const planRows = useMemo(() => (session ? sessionPlanRows(session) : []), [session])
	const plan = useMemo(() => buildSessionPlanFromSession(session), [session])
	const { exerciseGroups, extraExercises, modes: exerciseModes, goals: exerciseGoals } = plan

	// Mode/goal edits persist via updatePlannedExercise, which needs a snapshot
	// row — pre-snapshot sessions and ad-hoc extras have none, so their controls hide
	const planEditable = (session?.plannedExercises.length ?? 0) > 0

	// Batched "last time" hints — one query per page covering every exercise in
	// the plan plus any extras logged so far. `before: session.startedAt`
	// excludes the in-progress session from the lookup.
	const lastSessionExerciseIds = useMemo<Exercise['id'][]>(() => {
		if (!session) return []
		const ids = new Set<Exercise['id']>()
		for (const pe of planRows) ids.add(pe.exerciseId)
		for (const log of session.logs) ids.add(log.exerciseId)
		return [...ids]
	}, [session, planRows])

	const lastSessionsQuery = trpc.workout.lastSessionsForExercises.useQuery(
		{
			exerciseIds: lastSessionExerciseIds,
			before: session?.startedAt
		},
		{ enabled: lastSessionExerciseIds.length > 0 && !!session }
	)
	const lastSessions = lastSessionsQuery.data

	// Rest duration for checklist-mode set confirms
	const restFor = useCallback(
		(exerciseId: Exercise['id'], reps: number, setType: SetType) => {
			const item = exerciseGroups.find(g =>
				g.type === 'standalone'
					? g.exerciseId === exerciseId
					: g.exercises.some(e => e.exerciseId === exerciseId)
			)
			const exercise =
				item?.type === 'standalone'
					? item.exercise
					: item?.exercises.find(e => e.exerciseId === exerciseId)?.exercise
			return calculateRest(reps, exercise?.fatigueTier ?? 2, exerciseGoals.get(exerciseId) ?? goal, setType)
		},
		[exerciseGroups, exerciseGoals, goal]
	)

	// Checklist set confirm: log it and start the rest timer (superset transitions
	// credit round time instead — full rest starts when the round closes)
	const handleChecklistAdd = useCallback(
		(data: {
			exerciseId: Exercise['id']
			weightKg: number
			reps: number
			setType: SetType
			transition?: boolean
		}) => {
			if (!session) return
			addSet.mutate({
				sessionId: session.id,
				exerciseId: data.exerciseId,
				weightKg: data.weightKg,
				reps: data.reps,
				setType: data.setType
			})
			if (data.transition) {
				storeRecordTransition()
			} else {
				storeStartRest(restFor(data.exerciseId, data.reps, data.setType), data.setType)
			}
		},
		[session, addSet, restFor, storeRecordTransition, storeStartRest]
	)

	// Equipment availability at the session's location. Null = no location = no warnings.
	const availableEquipment = useMemo(
		() => (session?.location ? equipmentSet(session.location.equipment) : null),
		[session?.location]
	)

	const missingByExerciseId = useMemo(() => {
		const map = new Map<Exercise['id'], Equipment[]>()
		if (!(availableEquipment && exercisesQuery.data)) return map
		for (const e of exercisesQuery.data) {
			const missing = missingEquipment(e.equipment, availableEquipment)
			if (missing.length > 0) map.set(e.id, missing)
		}
		return map
	}, [availableEquipment, exercisesQuery.data])

	// Planned exercises that can't be performed at the session's location
	const unavailableExercises = useMemo(() => {
		if (missingByExerciseId.size === 0) return []
		const result: { id: Exercise['id']; name: string; missing: Equipment[] }[] = []
		for (const g of exerciseGroups) {
			const entries =
				g.type === 'superset'
					? g.exercises.map(e => ({ id: e.exerciseId, name: e.exercise.name }))
					: [{ id: g.exerciseId, name: g.exercise.name }]
			for (const e of entries) {
				const missing = missingByExerciseId.get(e.id)
				if (missing && !result.some(r => r.id === e.id)) result.push({ ...e, missing })
			}
		}
		return result
	}, [exerciseGroups, missingByExerciseId])

	// Helper: check if a render item has pending (unlogged) planned sets
	const itemHasPending = useCallback((item: RenderItem) => {
		if (item.type === 'standalone') {
			return item.planned.length > item.logs.length
		}
		return item.exercises.some(e => e.planned.length > e.logs.length)
	}, [])

	// Checklist highlight: the earliest exercise group with unlogged planned sets
	const firstPendingItem = useMemo(
		() => exerciseGroups.find(itemHasPending) ?? null,
		[exerciseGroups, itemHasPending]
	)

	// Page-level keyboard handler: Enter/Space confirms the active pending set.
	// The pending SetRow exposes its confirm via [data-confirm-pending] because the
	// row owns its uncommitted weight/reps inputs — clicking it submits those.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return
			const el = document.activeElement
			if (
				el &&
				el !== document.body &&
				(el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT' ||
					el.tagName === 'BUTTON')
			)
				return
			const btn = document.querySelector<HTMLButtonElement>('[data-confirm-pending]')
			if (btn) {
				e.preventDefault()
				btn.click()
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [])

	useDocumentTitle(session?.name ?? 'Workout Session')
	const vol = session ? totalVolume(session.logs) : 0
	const isCompleted = !!session?.completedAt

	if (isCreating || sessionQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (!session) {
		if (sessionQuery.error) return <TRPCError error={sessionQuery.error} />
		if (createSession.error) return <TRPCError error={createSession.error} />
		return null
	}

	const totalExercises = exerciseGroups.reduce((acc, g) => acc + (g.type === 'superset' ? g.exercises.length : 1), 0)

	return (
		<div className="space-y-3">
			{sessionQuery.error && <TRPCError error={sessionQuery.error} />}
			<div className="flex flex-col gap-3 md:flex-row md:items-center">
				<Link to="/workouts" className="text-ink-muted hover:text-ink">
					<ArrowLeft className="size-5" />
				</Link>
				<div className="min-w-0 flex-1">
					<h1 className="font-semibold text-ink">{session.name ?? 'Workout Session'}</h1>
					<div className="font-mono text-ink-muted text-xs tabular-nums">
						{formatDate(session.startedAt)} · {totalExercises} exercises · {session.logs.length} sets ·{' '}
						{(vol / 1000).toFixed(1)}k vol
						{session.workoutId && session.workout && (
							<>
								{' · '}
								<Link to={`/workouts/${session.workoutId}`} className="text-accent hover:underline">
									{session.workout.name}
								</Link>
							</>
						)}
						{isCompleted && session.location && <> · at {session.location.name}</>}
						{isCompleted && (
							<span className="ml-2 rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
								completed
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<CopyButton getText={() => formatSession(session)} />
					{!isCompleted && (
						<>
							<LinkButton to="timer" size="sm">
								<Timer className="size-3.5" />
								{storeSessionStartedAt ? 'Timer' : 'Start Timer'}
							</LinkButton>
							<Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
								<Upload className="size-3.5" />
								Import
							</Button>
							<Button
								size="sm"
								variant="secondary"
								onClick={() => {
									if (session.workout) {
										setShowReview(true)
									} else {
										completeSession.mutate({ id: session.id })
									}
								}}
								disabled={session.logs.length === 0 || completeSession.isPending}
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

			{isCompleted && (
				<SessionSummary
					session={session}
					plannedExercises={session.plannedExercises ?? []}
					bodyWeightKg={bodyWeightKg}
				/>
			)}

			{!isCompleted && locationsQuery.data && locationsQuery.data.length > 0 && (
				<div className="flex items-center gap-1.5">
					<MapPin className="size-3.5 shrink-0 text-ink-faint" />
					<Select<Location['id'] | ''>
						className="h-7 max-w-48 text-xs"
						value={session.locationId ?? ''}
						options={[
							{ label: 'No location', value: '' },
							...locationsQuery.data.map(l => ({ label: l.name, value: l.id }))
						]}
						onChange={v =>
							updateSessionLocation.mutate({ id: session.id, locationId: v === '' ? null : v })
						}
					/>
					{updateSessionLocation.error && <TRPCError error={updateSessionLocation.error} />}
				</div>
			)}

			{!isCompleted && session.location && unavailableExercises.length > 0 && (
				<Card className="space-y-1 border-amber-500/40 bg-amber-500/5 p-3">
					<div className="flex items-center gap-1.5 text-amber-500 text-sm">
						<AlertTriangle className="size-4 shrink-0" />
						<span>
							{unavailableExercises.length}{' '}
							{unavailableExercises.length === 1 ? 'exercise needs' : 'exercises need'} equipment{' '}
							{session.location.name} doesn't have
						</span>
					</div>
					<ul className="pl-6 text-ink-muted text-xs">
						{unavailableExercises.map(e => (
							<li key={e.id}>
								{e.name} — missing {formatEquipmentList(e.missing)}
							</li>
						))}
					</ul>
					<p className="pl-6 text-ink-faint text-xs">Use each exercise's replace action to swap them.</p>
				</Card>
			)}

			{!isCompleted && exercisesQuery.data && (
				<ExerciseSearch
					exercises={exercisesQuery.data}
					unavailable={missingByExerciseId}
					onSelect={exercise => {
						// Adds a 0×0 placeholder set — no rest timer for that
						addSet.mutate({
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
				{exerciseGroups.map(item => {
					if (item.type === 'superset') {
						return (
							<SupersetForm
								key={`ss-${item.group}`}
								group={item.group}
								exercises={item.exercises.map(e => ({
									exercise: e.exercise,
									logs: e.logs,
									plannedSets: e.planned,
									setMode: exerciseModes.get(e.exerciseId) ?? 'working',
									trainingGoal: exerciseGoals.get(e.exerciseId),
									lastSession: lastSessions?.[e.exerciseId] ?? null
								}))}
								goal={goal}
								readOnly={isCompleted}
								active={item === firstPendingItem}
								bodyWeightKg={bodyWeightKg}
								onAddSet={handleChecklistAdd}
								onUpdateSet={(logId, updates) => updateSet.mutate({ id: logId, ...updates })}
								onRemoveSet={logId => removeSet.mutate({ id: logId })}
								onReplace={exerciseId => setReplaceExerciseId(exerciseId)}
								onTrainingGoalChange={
									planEditable
										? (exerciseId, g) => {
												updatePlannedExercise.mutate({
													sessionId: session.id,
													exerciseId,
													trainingGoal: g
												})
											}
										: undefined
								}
							/>
						)
					}

					return (
						<ExerciseSetForm
							key={item.exerciseId}
							exercise={item.exercise}
							logs={item.logs}
							plannedSets={item.planned.length > 0 ? item.planned : undefined}
							setMode={exerciseModes.get(item.exerciseId)}
							trainingGoal={exerciseGoals.get(item.exerciseId)}
							workoutGoal={goal}
							active={item === firstPendingItem}
							lastSession={lastSessions?.[item.exerciseId] ?? null}
							onSetModeChange={
								planEditable && exerciseModes.has(item.exerciseId)
									? mode => {
											updatePlannedExercise.mutate({
												sessionId: session.id,
												exerciseId: item.exerciseId,
												setMode: mode
											})
										}
									: undefined
							}
							onTrainingGoalChange={
								planEditable && exerciseModes.has(item.exerciseId)
									? g => {
											updatePlannedExercise.mutate({
												sessionId: session.id,
												exerciseId: item.exerciseId,
												trainingGoal: g
											})
										}
									: undefined
							}
							readOnly={isCompleted}
							bodyWeightKg={bodyWeightKg}
							onAddSet={handleChecklistAdd}
							onUpdateSet={(logId, updates) => updateSet.mutate({ id: logId, ...updates })}
							onRemoveSet={logId => removeSet.mutate({ id: logId })}
							onReplace={exerciseId => setReplaceExerciseId(exerciseId)}
						/>
					)
				})}
			</div>

			{session.logs.length === 0 && exerciseGroups.length === 0 && (
				<Card className="py-8 text-center text-ink-faint text-sm">
					Search and add exercises above to start logging sets.
				</Card>
			)}

			<Outlet />

			{replaceExerciseId && exercisesQuery.data && (
				<ExerciseReplaceModal
					exerciseId={replaceExerciseId}
					exerciseName={
						exerciseGroups
							.flatMap(g => (g.type === 'superset' ? g.exercises.map(e => e.exercise) : [g.exercise]))
							.find(e => e.id === replaceExerciseId)?.name ?? ''
					}
					allExercises={exercisesQuery.data}
					unavailable={missingByExerciseId}
					excludeIds={
						new Set(
							exerciseGroups.flatMap(g =>
								g.type === 'superset' ? g.exercises.map(e => e.exerciseId) : [g.exerciseId]
							)
						)
					}
					onReplace={selected => {
						const oldId = replaceExerciseId
						// Seed the replacement with a weight estimated from the plan's
						// other lifts via strength standards
						const reps = TRAINING_DEFAULTS[exerciseGoals.get(oldId) ?? goal].targetReps
						const estimated = estimateReplacementWeight(
							selected.id,
							reps,
							planRows
								.filter(pe => pe.exerciseId !== oldId)
								.map(pe => ({
									exerciseId: pe.exerciseId,
									targetWeight: pe.targetWeight,
									targetReps: pe.targetReps
								})),
							standardsQuery.data ?? []
						)
						replaceExerciseMutation.mutate({
							sessionId: session.id,
							oldExerciseId: oldId,
							newExerciseId: selected.id,
							// roundWeight can floor tiny estimates to 0, which the .positive() schema rejects
							targetWeight: estimated || null
						})
						setReplaceExerciseId(null)
					}}
					onClose={() => setReplaceExerciseId(null)}
				/>
			)}

			<ImportDialog
				open={showImport}
				onClose={() => setShowImport(false)}
				mode="sets"
				sessionId={session.id}
				workoutId={session.workoutId ?? undefined}
				onImported={() => utils.workout.getSession.invalidate({ id: session.id })}
			/>

			{showReview && session.workout && (
				<SessionReview
					session={session}
					template={session.workout}
					extraExercises={extraExercises.map(eg => ({
						exerciseId: eg.exercise.id,
						exerciseName: eg.exercise.name,
						logs: eg.logs
					}))}
					bodyWeightKg={bodyWeightKg}
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
