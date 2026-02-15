import type { FatigueTier, SetMode, TrainingGoal, TypeIDString } from '@macromaxxing/db'
import { ArrowLeft, Check, Timer, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CopyButton, LinkButton, Spinner, TRPCError } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
import { useDocumentTitle } from '~/lib/useDocumentTitle'
import { ExerciseSearch } from './components/ExerciseSearch'
import { ExerciseSetForm, type PlannedSet } from './components/ExerciseSetForm'
import { ImportDialog } from './components/ImportDialog'
import { SessionReview } from './components/SessionReview'
import { SupersetForm } from './components/SupersetForm'
import { useRestTimer } from './RestTimerContext'
import { formatSession } from './utils/export'
import { totalVolume } from './utils/formulas'
import {
	calculateRest,
	generateBackoffSets,
	generateWarmupSets,
	shouldSkipWarmup,
	TRAINING_DEFAULTS
} from './utils/sets'

type SessionLog = RouterOutput['workout']['getSession']['logs'][number]
type SessionExercise = SessionLog['exercise']

type RenderItem =
	| { type: 'standalone'; exerciseId: string; exercise: SessionExercise; logs: SessionLog[]; planned: PlannedSet[] }
	| {
			type: 'superset'
			group: number
			exercises: Array<{
				exerciseId: string
				exercise: SessionExercise
				logs: SessionLog[]
				planned: PlannedSet[]
			}>
	  }

export function WorkoutSessionPage() {
	const { sessionId, workoutId } = useParams<{ sessionId?: string; workoutId?: string }>()
	const navigate = useNavigate()
	const [showImport, setShowImport] = useState(false)
	const [showReview, setShowReview] = useState(false)
	const [modeOverrides, setModeOverrides] = useState<Map<string, SetMode>>(new Map())
	const { setSession, startedAt: timerActive, start: startTimer } = useRestTimer()
	const transitionRef = useRef(false)
	const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null)
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

	// Signal rest timer that a session is active (sessionId only — elapsed activates from TimerMode)
	const isCompleteSession = !!sessionQuery.data?.completedAt
	useEffect(() => {
		if (sessionQuery.data && !isCompleteSession) {
			setSession({ id: sessionQuery.data.id })
		}
	}, [sessionQuery.data, isCompleteSession, setSession])

	const exercisesQuery = trpc.workout.listExercises.useQuery()

	const goal = (sessionQuery.data?.workout?.trainingGoal ?? 'hypertrophy') as TrainingGoal

	type SessionData = NonNullable<typeof sessionQuery.data>

	const addSetMutation = trpc.workout.addSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: effectiveSessionId! })
			const previous = utils.workout.getSession.getData({ id: effectiveSessionId! })
			if (previous) {
				// Find exercise data from existing logs or template
				const existingLog = previous.logs.find(l => l.exerciseId === variables.exerciseId)
				const templateExercise = previous.workout?.exercises.find(
					we => we.exerciseId === variables.exerciseId
				)?.exercise
				const exercise = existingLog?.exercise ?? templateExercise
				if (exercise) {
					const existingCount = previous.logs.filter(l => l.exerciseId === variables.exerciseId).length
					const optimisticLog = {
						id: `wkl_temp_${Date.now()}`,
						sessionId: variables.sessionId,
						exerciseId: variables.exerciseId,
						setNumber: existingCount + 1,
						setType: variables.setType ?? 'working',
						weightKg: variables.weightKg,
						reps: variables.reps,
						rpe: variables.rpe ?? null,
						failureFlag: 0,
						createdAt: Date.now(),
						exercise
					} as SessionData['logs'][number]
					utils.workout.getSession.setData(
						{ id: effectiveSessionId! },
						{
							...previous,
							logs: [...previous.logs, optimisticLog]
						}
					)
				}
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: effectiveSessionId! }, context.previous)
			}
		},
		onSuccess: (_data, variables) => {
			setActiveExerciseId(variables.exerciseId)
			// Auto-start rest timer
			if (!isCompleteSession) {
				if (transitionRef.current) {
					// Mid-superset round: short transition timer
					startTimer(15, variables.setType ?? 'working', true)
					transitionRef.current = false
				} else {
					// Standalone set or last exercise in superset round: full rest
					const exercise = exerciseGroups.find(g => {
						if (g.type === 'standalone') return g.exerciseId === variables.exerciseId
						return g.exercises.some(e => e.exerciseId === variables.exerciseId)
					})
					const tier: FatigueTier =
						exercise?.type === 'standalone'
							? (exercise.exercise.fatigueTier as FatigueTier)
							: ((exercise?.exercises.find(e => e.exerciseId === variables.exerciseId)?.exercise
									.fatigueTier as FatigueTier) ?? 2)
					const rest = calculateRest(variables.reps, tier, goal, variables.setType ?? 'working')
					startTimer(rest, variables.setType ?? 'working')
				}
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
	const deleteSessionMutation = trpc.workout.deleteSession.useMutation({
		onSuccess: () => {
			setSession(null)
			utils.workout.listSessions.invalidate()
			navigate('/workouts')
		}
	})

	type ExerciseGroup = { exercise: SessionExercise; logs: SessionLog[] }

	// Group logs by exercise, preserving template order + superset grouping
	const { exerciseGroups, extraExercises, exerciseModes } = useMemo<{
		exerciseGroups: RenderItem[]
		extraExercises: ExerciseGroup[]
		exerciseModes: Map<string, SetMode>
	}>(() => {
		if (!sessionQuery.data) return { exerciseGroups: [], extraExercises: [], exerciseModes: new Map() }

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

		// Build planned sets from template with warmup/backoff auto-generation
		const planned = new Map<string, PlannedSet[]>()
		const templateExerciseIds = new Set<string>()
		const modes = new Map<string, SetMode>()

		// Track which muscles have been warmed up by preceding exercises
		const warmedUpMuscles = new Map<string, number>()

		const goalDefaults = TRAINING_DEFAULTS[goal]

		// Per-exercise data for grouping
		type ExerciseData = {
			exerciseId: string
			exercise: SessionExercise
			logs: SessionLog[]
			planned: PlannedSet[]
			supersetGroup: number | null
		}
		const exerciseDataList: ExerciseData[] = []

		if (template) {
			for (const we of template.exercises) {
				templateExerciseIds.add(we.exerciseId)
				const templateMode = (we.setMode ?? 'working') as SetMode
				const effectiveMode = modeOverrides.get(we.exerciseId) ?? templateMode
				modes.set(we.exerciseId, effectiveMode)

				const effectiveSets = we.targetSets ?? goalDefaults.targetSets
				const effectiveReps = we.targetReps ?? goalDefaults.targetReps

				const sets: PlannedSet[] = []
				let setNum = 1
				const hasWarmup = effectiveMode === 'warmup' || effectiveMode === 'full'
				const hasBackoff = effectiveMode === 'backoff' || effectiveMode === 'full'

				// Generate warmup sets
				if (hasWarmup && we.targetWeight != null && we.targetWeight > 0) {
					const skipWarmup = shouldSkipWarmup(we.exercise.muscles, warmedUpMuscles)
					if (!skipWarmup) {
						const warmups = generateWarmupSets(we.targetWeight, effectiveReps)
						for (const wu of warmups) {
							sets.push({ setNumber: setNum++, weightKg: wu.weightKg, reps: wu.reps, setType: 'warmup' })
						}
					}
					// Track warmed-up muscles
					for (const m of we.exercise.muscles) {
						const existing = warmedUpMuscles.get(m.muscleGroup) ?? 0
						warmedUpMuscles.set(m.muscleGroup, Math.max(existing, m.intensity))
					}
				}

				// Generate working sets (subtract 1 if backoff)
				const workingCount = hasBackoff ? Math.max(1, effectiveSets - 1) : effectiveSets
				for (let i = 0; i < workingCount; i++) {
					sets.push({
						setNumber: setNum++,
						weightKg: we.targetWeight,
						reps: effectiveReps,
						setType: 'working'
					})
				}

				// Generate backoff set
				if (hasBackoff && we.targetWeight != null && we.targetWeight > 0) {
					const backoffs = generateBackoffSets(we.targetWeight, effectiveReps, 1)
					for (const bo of backoffs) {
						sets.push({ setNumber: setNum++, weightKg: bo.weightKg, reps: bo.reps, setType: 'backoff' })
					}
				}

				planned.set(we.exerciseId, sets)

				const logged = logsByExercise.get(we.exerciseId)
				exerciseDataList.push({
					exerciseId: we.exerciseId,
					exercise: logged?.exercise ?? we.exercise,
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
		const processedIds = new Set<string>()

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

		return { exerciseGroups: items, extraExercises: extras, exerciseModes: modes }
	}, [sessionQuery.data, modeOverrides, goal])

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
									setMode: exerciseModes.get(e.exerciseId) ?? 'working'
								}))}
								goal={goal}
								readOnly={isCompleted}
								active={item.exercises.some(e => e.exerciseId === activeExerciseId)}
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
							active={activeExerciseId === item.exerciseId}
							onSetModeChange={mode => {
								setModeOverrides(prev => {
									const next = new Map(prev)
									next.set(item.exerciseId, mode)
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
					}
				}}
			/>

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
