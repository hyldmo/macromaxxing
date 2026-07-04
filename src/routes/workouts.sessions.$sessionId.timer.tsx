import type { Exercise, SetType, WorkoutSession } from '@macromaxxing/db'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router'
import { ExerciseGuideModal } from '~/features/workouts/components/ExerciseGuideModal'
import { SessionNotesModal } from '~/features/workouts/components/SessionNotesModal'
import { TimerModeView } from '~/features/workouts/components/TimerModeView'
import { useElapsedTimer } from '~/features/workouts/hooks/useElapsedTimer'
import { useWorkoutSessionStore } from '~/features/workouts/store'
import { useWakeLock } from '~/features/workouts/useWakeLock'
import { flattenSets, type RenderItem, useScrollLock } from '~/lib'

export interface TimerModeContext {
	exerciseGroups: RenderItem[]
	setActiveExerciseId: (id: string | null) => void
	session: { id: WorkoutSession['id']; startedAt: number; name: string | null; notes: string | null }
	onConfirmSet: (
		data: {
			exerciseId: Exercise['id']
			weightKg: number
			reps: number
			setType: SetType
			transition?: boolean
		},
		onLogId?: (id: string) => void
	) => void
	onUpdateSet: (id: string, updates: { weightKg?: number; reps?: number }) => void
	onUndoSet: () => void
	getRestDuration: (exerciseId: Exercise['id'], reps: number, setType: SetType) => number
	bodyWeightKg?: number | null
}

const TimerMode: FC = () => {
	const {
		exerciseGroups,
		setActiveExerciseId,
		session,
		onConfirmSet,
		onUpdateSet,
		onUndoSet,
		getRestDuration,
		bodyWeightKg
	} = useOutletContext<TimerModeContext>()
	const { sessionId } = useParams<{ sessionId: string }>()
	const navigate = useNavigate()
	const onClose = useCallback(() => navigate('..'), [navigate])

	const active = useWorkoutSessionStore(s => s.active)
	const rest = useWorkoutSessionStore(s => s.rest)
	const queue = useWorkoutSessionStore(s => s.queue)
	const confirmedIndices = useWorkoutSessionStore(s => s.confirmedIndices)
	const _roundStartedAt = useWorkoutSessionStore(s => s._roundStartedAt)
	const actions = useWorkoutSessionStore.getState
	const [guideOpen, setGuideOpen] = useState(false)
	const [notesOpen, setNotesOpen] = useState(false)
	const [activeGuideExercise, setActiveGuideExercise] = useState<{ id: Exercise['id']; name: string } | null>(null)
	const hasNotes = (session.notes ?? '').trim().length > 0
	useWakeLock()
	useScrollLock()

	// Initialize store on mount
	const flatSets = useMemo(() => flattenSets(exerciseGroups), [exerciseGroups])
	const didInit = useMemo(() => ({ current: false }), [])
	useEffect(() => {
		if (flatSets.length > 0 && !didInit.current && sessionId) {
			didInit.current = true
			// Only init if store doesn't already have this session's queue
			if (useWorkoutSessionStore.getState().queue.length === 0) {
				actions().init(sessionId, session.startedAt, flatSets)
			} else {
				// Ensure sessionStartedAt is set for elapsed display
				actions().setSession({ id: sessionId, startedAt: session.startedAt })
			}
		}
	}, [flatSets, didInit, sessionId, session.startedAt])
	const isResting = rest !== null
	const currentSet = active ? queue[active.index] : null

	const preciseRemaining = -useElapsedTimer(rest?.endAt ?? null) / 1000
	const setTimerActive = active?.setTimer && !active.setTimer.isPaused ? active.setTimer.startedAt : null
	const liveElapsedMs = useElapsedTimer(setTimerActive)
	// When paused, show frozen elapsed; when active, show live; otherwise 0
	const setElapsedMs = active?.setTimer
		? active.setTimer.isPaused
			? Date.now() - active.setTimer.startedAt
			: liveElapsedMs
		: 0

	// Find next pending after current for preview
	const nextSet = useMemo(() => {
		if (!active) return null
		for (let i = active.index + 1; i < queue.length; i++) {
			if (!(queue[i].completed || confirmedIndices.includes(i))) return queue[i]
		}
		return null
	}, [queue, active, confirmedIndices])

	// Detect if current set is part of a superset
	const isInSuperset = useMemo(() => {
		if (!currentSet) return false
		if (currentSet.transition) return true
		return active !== null && active.index > 0 && queue[active.index - 1]?.transition === true
	}, [currentSet, active, queue])

	const handleStartSet = useCallback(() => {
		actions().startSet()
	}, [])

	const handlePause = useCallback(() => {
		actions().pauseSet()
	}, [])

	const handleResume = useCallback(() => {
		const timer = useWorkoutSessionStore.getState().active?.setTimer
		if (timer) actions().resumeSet(Date.now() - timer.startedAt)
	}, [])

	const handleEditWeight = useCallback(
		(weight: number | null) => {
			actions().editWeight(weight)
			if (active?.logId && weight != null) {
				onUpdateSet(active.logId, { weightKg: weight })
			}
		},
		[active?.logId, onUpdateSet]
	)

	const handleEditReps = useCallback(
		(reps: number) => {
			actions().editReps(reps)
			if (active?.logId) {
				onUpdateSet(active.logId, { reps })
			}
		},
		[active?.logId, onUpdateSet]
	)

	const handleConfirm = useCallback(() => {
		if (!currentSet || isResting) return

		actions().stopSet()

		setActiveExerciseId(currentSet.exerciseId)

		const data = actions().confirmSet()
		if (!data) return

		onConfirmSet(data, id => actions().setLogId(id))

		if (!data.transition) {
			// End of round or solo: start rest countdown
			const dur = getRestDuration(data.exerciseId, data.reps, data.setType)
			actions().startRest(dur, data.setType)
		}
	}, [currentSet, isResting, setActiveExerciseId, getRestDuration, onConfirmSet])

	const handleDismissTimer = useCallback(() => {
		actions().dismissRest()
	}, [])

	const handleUndo = useCallback(() => {
		actions().undo()

		onUndoSet()
	}, [onUndoSet])

	const handleStopSet = useCallback(() => {
		actions().stopSet()
	}, [])

	const handleNavigate = useCallback((direction: -1 | 1) => actions().navigate(direction), [])
	const handleNavigateSet = useCallback((direction: -1 | 1) => actions().navigateSet(direction), [])

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
				if (isResting) {
					handleDismissTimer()
				} else if (active?.setTimer?.isPaused) {
					handleResume()
				} else if (active?.setTimer) {
					handleConfirm()
				} else {
					handleStartSet()
				}
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [handleConfirm, handleDismissTimer, handleStartSet, handleResume, isResting, active, onClose])

	const isDoingSet =
		active?.setTimer !== null && active?.setTimer !== undefined && !isResting && !active.setTimer.isPaused
	const isSetPaused = (active?.setTimer?.isPaused && !isResting) ?? false
	const hasConfirmedSets = confirmedIndices.length > 0

	return (
		<>
			<TimerModeView
				fixed
				exerciseGroupCount={exerciseGroups.length}
				currentSet={currentSet ?? null}
				nextSet={nextSet ?? null}
				isResting={isResting}
				isDoingSet={isDoingSet}
				isSetPaused={isSetPaused}
				isInSuperset={isInSuperset}
				hasConfirmedSets={hasConfirmedSets}
				hasNotes={hasNotes}
				setElapsedSec={setElapsedMs / 1000}
				restRemainingSec={preciseRemaining}
				restTotalSec={rest?.total ?? 0}
				roundStartedAt={_roundStartedAt}
				restSetType={rest?.setType ?? 'working'}
				sessionElapsedSec={(Date.now() - session.startedAt) / 1000}
				weight={active?.weight ?? null}
				reps={active?.reps ?? 0}
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
					onClose={() => setNotesOpen(false)}
				/>
			)}
		</>
	)
}

export default TimerMode
