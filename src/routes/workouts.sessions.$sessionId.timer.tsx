import type { Exercise, WorkoutSession } from '@macromaxxing/db'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ExerciseGuideModal } from '~/features/workouts/components/ExerciseGuideModal'
import { type NotesExercise, SessionNotesModal } from '~/features/workouts/components/SessionNotesModal'
import { TimerModeView } from '~/features/workouts/components/TimerModeView'
import { useElapsedTimer } from '~/features/workouts/hooks/useElapsedTimer'
import { isOptimisticLogId, useSessionSets } from '~/features/workouts/hooks/useSessionSets'
import { useWorkoutSessionStore } from '~/features/workouts/store'
import { useWakeLock } from '~/features/workouts/useWakeLock'
import {
	buildSessionPlanFromSession,
	calculateRest,
	confirmOutcome,
	cursorEquals,
	cursorIndex,
	cursorOf,
	dismissOutcome,
	flattenSets,
	nextExercisePendingIndex,
	nextPendingIndex,
	resolveCursorIndex,
	undoCursor,
	useScrollLock
} from '~/lib'
import { trpc } from '~/lib/trpc'

const TimerMode: FC = () => {
	const { sessionId } = useParams<{ sessionId: WorkoutSession['id'] }>()
	const navigate = useNavigate()
	const onClose = useCallback(() => navigate('..'), [navigate])

	// Same query as the session page underneath — react-query dedupes; both
	// surfaces always render the same live session state.
	const sessionQuery = trpc.workout.getSession.useQuery({ id: sessionId! }, { enabled: !!sessionId })
	const session = sessionQuery.data
	const profileQuery = trpc.settings.getProfile.useQuery()
	const bodyWeightKg = profileQuery.data?.weightKg ?? null
	const { addSet, updateSet, removeSet } = useSessionSets(sessionId)

	const cursor = useWorkoutSessionStore(s => s.cursor)
	const draft = useWorkoutSessionStore(s => s.draft)
	const setTimer = useWorkoutSessionStore(s => s.setTimer)
	const rest = useWorkoutSessionStore(s => s.rest)
	const roundStartedAt = useWorkoutSessionStore(s => s.roundStartedAt)
	const actions = useWorkoutSessionStore.getState
	const [guideOpen, setGuideOpen] = useState(false)
	const [notesOpen, setNotesOpen] = useState(false)
	const [activeGuideExercise, setActiveGuideExercise] = useState<{ id: Exercise['id']; name: string } | null>(null)
	useWakeLock()
	useScrollLock()

	// The set queue is derived from live session data on every render — plan
	// edits, replacements, and checklist-mode logging are always reflected. The
	// store only holds the cursor (stable set identity), which resolveCursorIndex
	// maps back into the current queue.
	const { exerciseGroups } = useMemo(() => buildSessionPlanFromSession(session), [session])
	const flatSets = useMemo(() => flattenSets(exerciseGroups), [exerciseGroups])
	// Per-exercise notes edit the template row's note (workoutExercises.note), so the
	// notepad lists the session's template exercises in plan order.
	const notesExercises = useMemo<NotesExercise[]>(
		() =>
			(session?.workout?.exercises ?? []).map(we => ({
				exerciseId: we.exerciseId,
				workoutExerciseId: we.id,
				name: we.exercise.name,
				note: we.note ?? ''
			})),
		[session]
	)
	const currentIndex = resolveCursorIndex(flatSets, cursor)
	const currentSet = currentIndex >= 0 ? flatSets[currentIndex] : null
	const isResting = rest !== null

	// Entry reconciliation: a cursor left on a completed set (rest dismissed from
	// the nav widget, sets logged in checklist mode) advances to the next pending
	// set. Once per entry — while open, deliberate browsing onto completed sets
	// must stick.
	const didReconcile = useRef(false)
	useEffect(() => {
		if (didReconcile.current || flatSets.length === 0) return
		didReconcile.current = true
		const state = useWorkoutSessionStore.getState()
		const idx = cursorIndex(flatSets, state.cursor)
		if (idx >= 0 && flatSets[idx].completed && state.rest === null) {
			const next = nextPendingIndex(flatSets, idx + 1)
			actions().setCursor(next >= 0 ? cursorOf(flatSets[next]) : null)
		}
	}, [flatSets])

	// Draft overlays the live planned values only while it belongs to the shown set
	const draftApplies = currentSet !== null && cursorEquals(cursor, cursorOf(currentSet))
	const weight = draftApplies && draft.weight !== undefined ? draft.weight : (currentSet?.weightKg ?? null)
	const reps = draftApplies && draft.reps !== undefined ? draft.reps : (currentSet?.reps ?? 0)

	const preciseRemaining = -useElapsedTimer(rest?.endAt ?? null) / 1000
	const runningStartedAt = setTimer && setTimer.pausedAt === null ? setTimer.startedAt : null
	const liveElapsedMs = useElapsedTimer(runningStartedAt)
	// When paused, elapsed is frozen at the pause point; resuming shifts startedAt
	const setElapsedMs = setTimer
		? setTimer.pausedAt !== null
			? setTimer.pausedAt - setTimer.startedAt
			: liveElapsedMs
		: 0

	const nextIndex = currentIndex >= 0 ? nextPendingIndex(flatSets, currentIndex + 1) : -1
	const nextSet = nextIndex >= 0 ? flatSets[nextIndex] : null

	const isInSuperset =
		currentSet !== null && (currentSet.transition || flatSets[currentIndex - 1]?.transition === true)

	const hasLoggedSets = (session?.logs.length ?? 0) > 0

	const handleStartSet = useCallback(() => {
		if (currentSet) actions().startSet(cursorOf(currentSet))
	}, [currentSet])

	const handlePause = useCallback(() => {
		actions().pauseSet()
	}, [])

	const handleResume = useCallback(() => {
		actions().resumeSet()
	}, [])

	const handleStopSet = useCallback(() => {
		actions().stopSet()
	}, [])

	// Edits: pending sets keep changes in the draft (confirm sends them); completed
	// sets persist straight to their log once its real id is known. In-flight edits
	// are replayed by the confirm mutation's onSuccess.
	const handleEditWeight = useCallback(
		(w: number | null) => {
			if (!currentSet) return
			actions().setDraft(cursorOf(currentSet), { weight: w })
			const logId = currentSet.log?.id
			if (currentSet.completed && logId && !isOptimisticLogId(logId) && w != null) {
				updateSet.mutate({ id: logId, weightKg: w })
			}
		},
		[currentSet, updateSet]
	)

	const handleEditReps = useCallback(
		(r: number) => {
			if (!currentSet) return
			actions().setDraft(cursorOf(currentSet), { reps: r })
			const logId = currentSet.log?.id
			if (currentSet.completed && logId && !isOptimisticLogId(logId)) {
				updateSet.mutate({ id: logId, reps: r })
			}
		},
		[currentSet, updateSet]
	)

	const handleConfirm = useCallback(() => {
		if (!currentSet || isResting || !sessionId) return
		const confirmed = cursorOf(currentSet)

		actions().stopSet()
		// Snap a drifted cursor to the set actually confirmed (clears its stale draft)
		if (!cursorEquals(useWorkoutSessionStore.getState().cursor, confirmed)) actions().setCursor(confirmed)

		const vars = {
			sessionId,
			exerciseId: currentSet.exerciseId,
			weightKg: weight ?? 0,
			reps,
			setType: currentSet.setType
		}
		addSet.mutate(vars, {
			onSuccess: log => {
				// Replay edits made while the log was in flight
				const state = useWorkoutSessionStore.getState()
				if (!cursorEquals(state.cursor, confirmed)) return
				const patch: { weightKg?: number; reps?: number } = {}
				if (state.draft.weight !== undefined && (state.draft.weight ?? 0) !== vars.weightKg) {
					patch.weightKg = state.draft.weight ?? 0
				}
				if (state.draft.reps !== undefined && state.draft.reps !== vars.reps) {
					patch.reps = state.draft.reps
				}
				if (patch.weightKg !== undefined || patch.reps !== undefined) {
					updateSet.mutate({ id: log.id, ...patch })
				}
			}
		})

		const outcome = confirmOutcome(flatSets, currentIndex)
		if (outcome.action === 'advance') {
			// Mid-superset: credit round time, jump to the next set, auto-start its stopwatch
			actions().recordTransition()
			if (outcome.next) actions().startSet(outcome.next)
			else actions().setCursor(null)
		} else {
			// Solo or round end: hold the cursor on the confirmed set while resting
			const dur = calculateRest(reps, currentSet.fatigueTier, currentSet.goal, currentSet.setType)
			actions().startRest(dur, currentSet.setType)
		}
	}, [currentSet, currentIndex, flatSets, isResting, weight, reps, sessionId, addSet, updateSet])

	const handleDismissTimer = useCallback(() => {
		actions().dismissRest()
		const outcome = dismissOutcome(flatSets, currentIndex)
		if (outcome.advance) actions().setCursor(outcome.next)
	}, [flatSets, currentIndex])

	const handleUndo = useCallback(() => {
		const lastLog = session?.logs.at(-1)
		if (!lastLog || isOptimisticLogId(lastLog.id)) return
		actions().dismissRest()
		// Land on the slot the removed log frees up (extra sets live outside the queue)
		const freed = undoCursor(flatSets, lastLog.id)
		if (freed) actions().setCursor(freed)
		removeSet.mutate({ id: lastLog.id })
	}, [session, flatSets, removeSet])

	const handleNavigate = useCallback(
		(direction: -1 | 1) => {
			const target = nextExercisePendingIndex(flatSets, currentIndex, direction)
			if (target >= 0) actions().setCursor(cursorOf(flatSets[target]))
		},
		[flatSets, currentIndex]
	)

	const handleNavigateSet = useCallback(
		(direction: -1 | 1) => {
			const target = currentIndex + direction
			if (target < 0 || target >= flatSets.length) return
			actions().setCursor(cursorOf(flatSets[target]))
		},
		[flatSets, currentIndex]
	)

	const handleOpenGuide = useCallback((id: Exercise['id'], name: string) => {
		setActiveGuideExercise({ id, name })
		setGuideOpen(true)
	}, [])

	// Keyboard: Enter/Space confirms or dismisses, Escape closes
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
				return
			}
			if (e.key === 'Enter' || e.key === ' ') {
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
				e.preventDefault()
				const state = useWorkoutSessionStore.getState()
				if (state.rest !== null) {
					handleDismissTimer()
				} else if (state.setTimer?.pausedAt != null) {
					handleResume()
				} else if (state.setTimer) {
					handleConfirm()
				} else {
					handleStartSet()
				}
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [handleConfirm, handleDismissTimer, handleStartSet, handleResume, onClose])

	if (!session) return null

	const isDoingSet = setTimer !== null && setTimer.pausedAt === null && !isResting
	const isSetPaused = setTimer !== null && setTimer.pausedAt !== null && !isResting
	const hasNotes = (session.notes ?? '').trim().length > 0 || notesExercises.some(ex => ex.note.trim().length > 0)

	return (
		<>
			<TimerModeView
				fixed
				exerciseGroupCount={exerciseGroups.length}
				currentSet={currentSet}
				nextSet={nextSet}
				isResting={isResting}
				isDoingSet={isDoingSet}
				isSetPaused={isSetPaused}
				isInSuperset={isInSuperset}
				hasConfirmedSets={hasLoggedSets}
				hasNotes={hasNotes}
				setElapsedSec={setElapsedMs / 1000}
				restRemainingSec={preciseRemaining}
				restTotalSec={rest?.total ?? 0}
				roundStartedAt={roundStartedAt}
				restSetType={rest?.setType ?? 'working'}
				sessionElapsedSec={(Date.now() - session.startedAt) / 1000}
				weight={weight}
				reps={reps}
				bodyWeightKg={bodyWeightKg}
				onClose={onClose}
				onOpenNotes={() => setNotesOpen(true)}
				onOpenGuide={handleOpenGuide}
				onNavigate={handleNavigate}
				onNavigateSet={handleNavigateSet}
				onConfirm={handleConfirm}
				onStartSet={handleStartSet}
				onPause={handlePause}
				onResume={handleResume}
				onStopSet={handleStopSet}
				onUndo={handleUndo}
				onDismissTimer={handleDismissTimer}
				onEditWeight={handleEditWeight}
				onEditReps={handleEditReps}
			/>
			{guideOpen && activeGuideExercise && (
				<ExerciseGuideModal
					exerciseId={activeGuideExercise.id}
					exerciseName={activeGuideExercise.name}
					onClose={() => setGuideOpen(false)}
				/>
			)}
			{notesOpen && (
				<SessionNotesModal
					sessionId={session.id}
					initialNotes={session.notes}
					exercises={notesExercises}
					focusExerciseId={currentSet?.exerciseId}
					onClose={() => setNotesOpen(false)}
				/>
			)}
		</>
	)
}

export default TimerMode
