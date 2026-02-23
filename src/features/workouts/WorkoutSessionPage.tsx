import type { Exercise, FatigueTier, SetMode, SetType, TrainingGoal, Workout, WorkoutSession } from '@macromaxxing/db'
import { ArrowLeft, Check, Timer, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CopyButton, LinkButton, Spinner, TRPCError } from '~/components/ui'
import {
	calculateRest,
	estimateReplacementWeight,
	formatSession,
	generatePlannedSets,
	type PlannedSet,
	TRAINING_DEFAULTS,
	totalVolume,
	useDocumentTitle
} from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
import { ExerciseReplaceModal } from './components/ExerciseReplaceModal'
import { ExerciseSearch } from './components/ExerciseSearch'
import { ExerciseSetForm } from './components/ExerciseSetForm'
import { ImportDialog } from './components/ImportDialog'
import { SessionReview } from './components/SessionReview'
import { SessionSummary } from './components/SessionSummary'
import { SupersetForm } from './components/SupersetForm'
import { useRestTimer } from './RestTimerContext'

type SessionLog = RouterOutput['workout']['getSession']['logs'][number]
type SessionExercise = SessionLog['exercise']

type RenderItem =
	| {
			type: 'standalone'
			exerciseId: Exercise['id']
			exercise: SessionExercise
			logs: SessionLog[]
			planned: PlannedSet[]
	  }
	| {
			type: 'superset'
			group: number
			exercises: Array<{
				exerciseId: Exercise['id']
				exercise: SessionExercise
				logs: SessionLog[]
				planned: PlannedSet[]
			}>
	  }

export function WorkoutSessionPage() {
	const { sessionId, workoutId } = useParams<{ sessionId?: WorkoutSession['id']; workoutId?: Workout['id'] }>()
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const [showReview, setShowReview] = useState(false)
	const [modeOverrides, setModeOverrides] = useState<Map<Exercise['id'], SetMode>>(new Map())
	const [goalOverrides, setGoalOverrides] = useState<Map<Exercise['id'], TrainingGoal | null>>(new Map())
	const { setSession, startedAt: timerActive, start: startTimer, isRunning: isResting, remaining } = useRestTimer()
	const transitionRef = useRef(false)
	const timerModeActiveRef = useRef(false)
	const [activeExerciseId, setActiveExerciseId] = useState<Exercise['id'] | null>(null)
	const [replaceExerciseId, setReplaceExerciseId] = useState<Exercise['id'] | null>(null)
	const [templateReplacements, setTemplateReplacements] = useState<Map<Exercise['id'], SessionExercise>>(new Map())
	const utils = trpc.useUtils()

	// If coming from /workouts/:workoutId/session, create a new session
	const createSession = trpc.workout.createSession.useMutation({
		onSuccess: session => {
			utils.workout.listSessions.invalidate()
			navigate(`/workouts/sessions/${session.id}`, { replace: true })
		}
	})

	const completeSession = trpc.workout.completeSession.useMutation({
		onSuccess: () => {
			setSession(null)
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

	// Signal rest timer that a session is active (sessionId only — elapsed activates from TimerMode)
	const isCompleteSession = !!sessionQuery.data?.completedAt
	useEffect(() => {
		if (sessionQuery.data && !isCompleteSession) {
			setSession({ id: sessionQuery.data.id })
		}
	}, [sessionQuery.data, isCompleteSession, setSession])

	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const standardsQuery = trpc.workout.listStandards.useQuery()

	const goal = sessionQuery.data?.workout?.trainingGoal ?? 'hypertrophy'

	const addSetMutation = trpc.workout.addSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: effectiveSessionId! })
			const previous = utils.workout.getSession.getData({ id: effectiveSessionId! })
			if (previous) {
				// Find exercise data from existing logs or template
				const exerciseData =
					previous.logs.find(l => l.exerciseId === variables.exerciseId)?.exercise ??
					previous.workout?.exercises.find(e => e.exerciseId === variables.exerciseId)?.exercise
				if (exerciseData) {
					const existingCount = previous.logs.filter(l => l.exerciseId === variables.exerciseId).length
					utils.workout.getSession.setData(
						{ id: effectiveSessionId! },
						{
							...previous,
							logs: [
								...previous.logs,
								{
									id: `wkl_optimistic_${Date.now()}` as SessionLog['id'],
									sessionId: variables.sessionId,
									exerciseId: variables.exerciseId,
									setNumber: existingCount + 1,
									setType: variables.setType ?? 'working',
									weightKg: variables.weightKg,
									reps: variables.reps,
									rpe: null,
									failureFlag: 0,
									createdAt: Date.now(),
									exercise: exerciseData
								}
							]
						}
					)
				}
			}
			return { previous }
		},
		onSuccess: (_data, variables) => {
			setActiveExerciseId(variables.exerciseId)
			// Auto-start rest timer (skip when TimerMode handles it locally)
			if (!(isCompleteSession || timerModeActiveRef.current)) {
				const rest = getRestDuration(
					variables.exerciseId,
					variables.reps,
					variables.setType ?? 'working',
					transitionRef.current
				)
				startTimer(rest, variables.setType ?? 'working', transitionRef.current)
				transitionRef.current = false
			}
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: effectiveSessionId! }, context.previous)
			}
		},
		onSettled: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})

	const updateSetMutation = trpc.workout.updateSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: effectiveSessionId! })
			const previous = utils.workout.getSession.getData({ id: effectiveSessionId! })
			if (previous) {
				utils.workout.getSession.setData(
					{ id: effectiveSessionId! },
					{
						...previous,
						logs: previous.logs.map(log =>
							log.id === variables.id
								? {
										...log,
										...(variables.weightKg !== undefined && { weightKg: variables.weightKg }),
										...(variables.reps !== undefined && { reps: variables.reps }),
										...(variables.setType !== undefined && { setType: variables.setType }),
										...(variables.rpe !== undefined && { rpe: variables.rpe }),
										...(variables.failureFlag !== undefined && {
											failureFlag: variables.failureFlag ? 1 : 0
										})
									}
								: log
						)
					}
				)
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: effectiveSessionId! }, context.previous)
			}
		},
		onSettled: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})

	const removeSetMutation = trpc.workout.removeSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: effectiveSessionId! })
			const previous = utils.workout.getSession.getData({ id: effectiveSessionId! })
			if (previous) {
				utils.workout.getSession.setData(
					{ id: effectiveSessionId! },
					{
						...previous,
						logs: previous.logs.filter(log => log.id !== variables.id)
					}
				)
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: effectiveSessionId! }, context.previous)
			}
		},
		onSettled: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})
	const replaceExerciseMutation = trpc.workout.replaceSessionExercise.useMutation({
		onSettled: () => utils.workout.getSession.invalidate({ id: effectiveSessionId! })
	})

	const deleteSessionMutation = trpc.workout.deleteSession.useMutation({
		onSuccess: () => {
			setSession(null)
			utils.workout.listSessions.invalidate()
			navigate('/workouts')
		}
	})

	type ExerciseGroup = { exercise: SessionExercise; logs: SessionLog[] }

	// Group logs by exercise, preserving template order + superset grouping
	const { exerciseGroups, extraExercises, exerciseModes, exerciseGoals } = useMemo<{
		exerciseGroups: RenderItem[]
		extraExercises: ExerciseGroup[]
		exerciseModes: Map<string, SetMode>
		exerciseGoals: Map<string, TrainingGoal>
	}>(() => {
		if (!sessionQuery.data)
			return { exerciseGroups: [], extraExercises: [], exerciseModes: new Map(), exerciseGoals: new Map() }

		const standards = standardsQuery.data ?? []
		const template = sessionQuery.data.workout
		const logsByExercise = new Map<Exercise['id'], ExerciseGroup>()

		for (const log of sessionQuery.data.logs) {
			const existing = logsByExercise.get(log.exerciseId)
			if (existing) {
				existing.logs.push(log)
			} else {
				logsByExercise.set(log.exerciseId, { exercise: log.exercise, logs: [log] })
			}
		}

		// Build planned sets from template with warmup/backoff auto-generation
		const planned = new Map<string, PlannedSet[]>()
		const templateExerciseIds = new Set<string>()
		const modes = new Map<string, SetMode>()
		const goals = new Map<string, TrainingGoal>()

		// Track which muscles have been warmed up by preceding exercises
		const warmedUpMuscles = new Map<string, number>()

		// Per-exercise data for grouping
		type ExerciseData = {
			exerciseId: Exercise['id']
			exercise: SessionExercise
			logs: SessionLog[]
			planned: PlannedSet[]
			supersetGroup: number | null
		}
		const exerciseDataList: ExerciseData[] = []

		if (template) {
			for (const we of template.exercises) {
				const replacement = templateReplacements.get(we.exerciseId)
				const effectiveExerciseId = replacement?.id ?? we.exerciseId
				const effectiveExercise = replacement ?? we.exercise

				templateExerciseIds.add(effectiveExerciseId)
				const templateMode = we.setMode ?? 'working'
				const effectiveMode = modeOverrides.get(effectiveExerciseId) ?? templateMode
				modes.set(effectiveExerciseId, effectiveMode)

				const goalOverride = goalOverrides.get(effectiveExerciseId)
				const exerciseGoal = goalOverride !== undefined ? (goalOverride ?? goal) : (we.trainingGoal ?? goal)
				goals.set(effectiveExerciseId, exerciseGoal)
				const exerciseDefaults = TRAINING_DEFAULTS[exerciseGoal]

				// When exercise is replaced, don't carry over the old exercise's targets —
				// instead estimate weight from other template exercises via strength standards
				const effectiveReps = (replacement ? null : we.targetReps) ?? exerciseDefaults.targetReps
				const effectiveTargetWeight = replacement
					? estimateReplacementWeight(
							effectiveExerciseId,
							effectiveReps,
							template.exercises
								.filter(e => e.exerciseId !== we.exerciseId)
								.map(e => ({
									exerciseId: templateReplacements.get(e.exerciseId)?.id ?? e.exerciseId,
									targetWeight: e.targetWeight,
									targetReps: e.targetReps
								})),
							standards
						)
					: we.targetWeight

				const sets = generatePlannedSets({
					setMode: effectiveMode,
					sets: (replacement ? null : we.targetSets) ?? exerciseDefaults.targetSets,
					reps: effectiveReps,
					weightKg: effectiveTargetWeight,
					muscles: effectiveExercise.muscles,
					warmedUpMuscles
				})

				planned.set(effectiveExerciseId, sets)

				const logged = logsByExercise.get(effectiveExerciseId)
				exerciseDataList.push({
					exerciseId: effectiveExerciseId,
					exercise: logged?.exercise ?? effectiveExercise,
					logs: logged?.logs ?? [],
					planned: sets,
					supersetGroup: we.supersetGroup
				})
			}
		}

		// Extra exercises not in template
		const extras: ExerciseGroup[] = []
		for (const [exerciseId, data] of logsByExercise) {
			if (!templateExerciseIds.has(exerciseId)) {
				exerciseDataList.push({
					exerciseId,
					exercise: data.exercise,
					logs: data.logs,
					planned: [],
					supersetGroup: null
				})
				extras.push(data)
			}
		}

		// Group into RenderItems
		const items: RenderItem[] = []
		const processedIds = new Set<Exercise['id']>()

		for (const ed of exerciseDataList) {
			if (processedIds.has(ed.exerciseId)) continue

			if (ed.supersetGroup !== null) {
				// Collect all exercises in this superset group
				const groupMembers = exerciseDataList.filter(
					e => e.supersetGroup === ed.supersetGroup && !processedIds.has(e.exerciseId)
				)
				if (groupMembers.length >= 2) {
					items.push({
						type: 'superset',
						group: ed.supersetGroup,
						exercises: groupMembers.map(e => ({
							exerciseId: e.exerciseId,
							exercise: e.exercise,
							logs: e.logs,
							planned: e.planned
						}))
					})
					for (const m of groupMembers) processedIds.add(m.exerciseId)
					continue
				}
			}

			// Standalone
			processedIds.add(ed.exerciseId)
			items.push({
				type: 'standalone',
				exerciseId: ed.exerciseId,
				exercise: ed.exercise,
				logs: ed.logs,
				planned: ed.planned
			})
		}

		return { exerciseGroups: items, extraExercises: extras, exerciseModes: modes, exerciseGoals: goals }
	}, [sessionQuery.data, modeOverrides, goalOverrides, goal, templateReplacements, standardsQuery.data])

	// Compute rest duration for an exercise — used by both addSetMutation.onSuccess and TimerMode
	const getRestDuration = useCallback(
		(exerciseId: Exercise['id'], reps: number, setType: SetType, transition: boolean) => {
			if (transition) return 15
			const exercise = exerciseGroups.find(g => {
				if (g.type === 'standalone') return g.exerciseId === exerciseId
				return g.exercises.some(e => e.exerciseId === exerciseId)
			})
			const tier: FatigueTier =
				exercise?.type === 'standalone'
					? exercise.exercise.fatigueTier
					: (exercise?.exercises.find(e => e.exerciseId === exerciseId)?.exercise.fatigueTier ?? 2)
			const exerciseGoal = exerciseGoals.get(exerciseId) ?? goal
			return calculateRest(reps, tier, exerciseGoal, setType)
		},
		[exerciseGroups, exerciseGoals, goal]
	)

	// Helper: check if a render item contains a given exerciseId
	const itemContainsExercise = useCallback(
		(item: RenderItem, id: string) =>
			item.type === 'standalone' ? item.exerciseId === id : item.exercises.some(e => e.exerciseId === id),
		[]
	)

	// Helper: check if a render item has pending (unlogged) planned sets
	const itemHasPending = useCallback((item: RenderItem) => {
		if (item.type === 'standalone') {
			return item.planned.length > item.logs.length
		}
		return item.exercises.some(e => e.planned.length > e.logs.length)
	}, [])

	// Auto-advance: if active exercise has no pending sets, move to next
	useEffect(() => {
		if (!activeExerciseId || exerciseGroups.length === 0) return
		const current = exerciseGroups.find(g => itemContainsExercise(g, activeExerciseId))
		if (current && !itemHasPending(current)) {
			const currentIdx = exerciseGroups.indexOf(current)
			const next = exerciseGroups.slice(currentIdx + 1).find(itemHasPending)
			setActiveExerciseId(
				next ? (next.type === 'standalone' ? next.exerciseId : next.exercises[0].exerciseId) : null
			)
		}
	}, [activeExerciseId, exerciseGroups, itemContainsExercise, itemHasPending])

	// Page-level keyboard handler: Enter/Space confirms the active pending set
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

	const session = sessionQuery.data
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

	if (sessionQuery.error) return <TRPCError error={sessionQuery.error} />
	if (createSession.error) return <TRPCError error={createSession.error} />
	if (!session) return null

	const totalExercises = exerciseGroups.reduce((acc, g) => acc + (g.type === 'superset' ? g.exercises.length : 1), 0)

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-3 md:flex-row md:items-center">
				<Link to="/workouts" className="text-ink-muted hover:text-ink">
					<ArrowLeft className="size-5" />
				</Link>
				<div className="min-w-0 flex-1">
					<h1 className="font-semibold text-ink">{session.name ?? 'Workout Session'}</h1>
					<div className="font-mono text-ink-muted text-xs tabular-nums">
						{formatDate(session.startedAt)} · {totalExercises} exercises · {session.logs.length} sets ·{' '}
						{(vol / 1000).toFixed(1)}k vol
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
								{timerActive ? 'Timer' : 'Start Timer'}
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

			{isCompleted && <SessionSummary session={session} plannedExercises={session.plannedExercises ?? []} />}

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
									trainingGoal: exerciseGoals.get(e.exerciseId)
								}))}
								goal={goal}
								readOnly={isCompleted}
								active={item.exercises.some(e => e.exerciseId === activeExerciseId)}
								restingExerciseId={
									isResting && remaining > 0 ? (activeExerciseId ?? undefined) : undefined
								}
								onAddSet={data => {
									transitionRef.current = data.transition ?? false
									addSetMutation.mutate({
										sessionId: session.id,
										exerciseId: data.exerciseId,
										weightKg: data.weightKg,
										reps: data.reps,
										setType: data.setType
									})
								}}
								onUpdateSet={(logId, updates) => updateSetMutation.mutate({ id: logId, ...updates })}
								onRemoveSet={logId => removeSetMutation.mutate({ id: logId })}
								onReplace={exerciseId => setReplaceExerciseId(exerciseId)}
								onTrainingGoalChange={(exerciseId, g) => {
									setGoalOverrides(prev => {
										const next = new Map(prev)
										next.set(exerciseId, g)
										return next
									})
								}}
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
							active={activeExerciseId === item.exerciseId}
							onSetModeChange={mode => {
								setModeOverrides(prev => {
									const next = new Map(prev)
									next.set(item.exerciseId, mode)
									return next
								})
							}}
							onTrainingGoalChange={g => {
								setGoalOverrides(prev => {
									const next = new Map(prev)
									next.set(item.exerciseId, g)
									return next
								})
							}}
							readOnly={isCompleted}
							onAddSet={data =>
								addSetMutation.mutate({
									sessionId: session.id,
									exerciseId: data.exerciseId,
									weightKg: data.weightKg,
									reps: data.reps,
									setType: data.setType
								})
							}
							onUpdateSet={(logId, updates) => updateSetMutation.mutate({ id: logId, ...updates })}
							onRemoveSet={logId => removeSetMutation.mutate({ id: logId })}
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

			<Outlet
				context={{
					exerciseGroups,
					session: { startedAt: session.startedAt, name: session.name ?? null },
					setActiveExerciseId,
					onConfirmSet: (data: {
						exerciseId: import('@macromaxxing/db').Exercise['id']
						weightKg: number
						reps: number
						setType: import('@macromaxxing/db').SetType
						transition?: boolean
					}) => {
						transitionRef.current = data.transition ?? false
						addSetMutation.mutate({
							sessionId: session.id,
							exerciseId: data.exerciseId,
							weightKg: data.weightKg,
							reps: data.reps,
							setType: data.setType
						})
					},
					onUndoSet: () => {
						const lastLog = session.logs.at(-1)
						if (lastLog) removeSetMutation.mutate({ id: lastLog.id })
					},
					getRestDuration,
					timerModeActiveRef
				}}
			/>

			{replaceExerciseId && exercisesQuery.data && (
				<ExerciseReplaceModal
					exerciseId={replaceExerciseId}
					exerciseName={
						exerciseGroups
							.flatMap(g => (g.type === 'superset' ? g.exercises.map(e => e.exercise) : [g.exercise]))
							.find(e => e.id === replaceExerciseId)?.name ?? ''
					}
					allExercises={exercisesQuery.data}
					excludeIds={
						new Set(
							exerciseGroups.flatMap(g =>
								g.type === 'superset' ? g.exercises.map(e => e.exerciseId) : [g.exerciseId]
							)
						)
					}
					onReplace={selected => {
						const oldId = replaceExerciseId
						const hasLogs = session.logs.some(l => l.exerciseId === oldId)
						if (hasLogs) {
							replaceExerciseMutation.mutate({
								sessionId: session.id,
								oldExerciseId: oldId,
								newExerciseId: selected.id
							})
						}
						setTemplateReplacements(prev => {
							const next = new Map(prev)
							next.set(oldId, selected)
							return next
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
					extraExercises={extraExercises.map((eg: ExerciseGroup) => ({
						exerciseId: eg.exercise.id,
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
