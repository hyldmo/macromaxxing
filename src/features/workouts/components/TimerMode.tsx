import type { Exercise, SetType } from '@macromaxxing/db'
import { ChevronLeft, ChevronRight, Dumbbell, Pause, Square, Undo2, X } from 'lucide-react'
import { type FC, type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button, NumberInput } from '~/components/ui'
import { cn, flattenSets, type RenderItem, useScrollLock } from '~/lib'
import { useTimerState } from '../hooks/useTimerState'
import { useRestTimer } from '../RestTimerContext'
import { useWakeLock } from '../useWakeLock'
import { TimerRing } from './TimerRing'

const SET_TYPE_STYLES: Record<SetType, string> = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
}

export interface TimerModeContext {
	exerciseGroups: RenderItem[]
	setActiveExerciseId: (id: string | null) => void
	session: { startedAt: number; name: string | null }
	onConfirmSet: (data: {
		exerciseId: Exercise['id']
		weightKg: number
		reps: number
		setType: SetType
		transition?: boolean
	}) => void
	onUndoSet: () => void
	getRestDuration: (exerciseId: Exercise['id'], reps: number, setType: SetType, transition: boolean) => number
	timerModeActiveRef: MutableRefObject<boolean>
}

function formatTime(seconds: number): string {
	const sign = seconds < 0 ? '-' : ''
	const abs = Math.abs(seconds)
	const h = Math.floor(abs / 3600)
	const m = Math.floor((abs % 3600) / 60)
	const s = Math.floor(abs % 60)
	const cs = Math.floor((abs * 100) % 100)
	const hm = h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m}`
	return `${sign}${hm}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}

export const TimerMode: FC = () => {
	const {
		exerciseGroups,
		setActiveExerciseId,
		session,
		onConfirmSet,
		onUndoSet,
		getRestDuration,
		timerModeActiveRef
	} = useOutletContext<TimerModeContext>()
	const { sessionId } = useParams<{ sessionId: string }>()
	const navigate = useNavigate()
	const onClose = useCallback(() => navigate('..'), [navigate])

	const restTimer = useRestTimer()
	useWakeLock()

	// Signal to parent that TimerMode is active (skip auto-timer in addSetMutation.onSuccess)
	useEffect(() => {
		timerModeActiveRef.current = true
		return () => {
			timerModeActiveRef.current = false
		}
	}, [timerModeActiveRef])

	// Activate nav elapsed display on mount
	useEffect(() => {
		if (sessionId) {
			restTimer.setSession({ id: sessionId, startedAt: session.startedAt })
		}
	}, [sessionId, session.startedAt, restTimer.setSession, restTimer])

	useScrollLock()

	// --- Local-first state via reducer ---
	const [state, dispatch] = useTimerState()
	const [preciseRemaining, setPreciseRemaining] = useState(0)
	const [setElapsedMs, setSetElapsedMs] = useState(0)
	const rafRef = useRef(0)
	const pendingConfirmRef = useRef<{
		exerciseId: Exercise['id']
		weightKg: number
		reps: number
		setType: SetType
		transition?: boolean
	} | null>(null)

	// Initialize queue from exerciseGroups on mount
	const flatSets = useMemo(() => flattenSets(exerciseGroups), [exerciseGroups])
	const didInit = useRef(false)
	useEffect(() => {
		if (flatSets.length > 0 && !didInit.current) {
			didInit.current = true
			dispatch({ type: 'INIT', sets: flatSets })
		}
	}, [flatSets, dispatch])

	const isResting = restTimer.isRunning
	const currentSet = state.currentIndex >= 0 ? state.queue[state.currentIndex] : null

	// Find next pending after current for preview
	const nextSet = useMemo(() => {
		if (state.currentIndex < 0) return null
		for (let i = state.currentIndex + 1; i < state.queue.length; i++) {
			if (!(state.queue[i].completed || state.locallyConfirmed.includes(i))) return state.queue[i]
		}
		return null
	}, [state.queue, state.currentIndex, state.locallyConfirmed])

	// High-frequency timer — only runs when set is active (not paused) or rest countdown is running
	const needsRaf = (state.setStartedAt !== null && !state.isPaused) || restTimer.endAt !== null
	useEffect(() => {
		if (!needsRaf) return
		const tick = () => {
			if (restTimer.endAt !== null) {
				setPreciseRemaining((restTimer.endAt - Date.now()) / 1000)
			}
			if (state.setStartedAt !== null && !state.isPaused) {
				setSetElapsedMs(Date.now() - state.setStartedAt)
			}
			rafRef.current = requestAnimationFrame(tick)
		}
		rafRef.current = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(rafRef.current)
	}, [needsRaf, restTimer.endAt, state.setStartedAt, state.isPaused])

	const handleStartSet = useCallback(() => {
		dispatch({ type: 'START_SET' })
		setSetElapsedMs(0)
	}, [dispatch])

	const handlePause = useCallback(() => {
		dispatch({ type: 'PAUSE' })
	}, [dispatch])

	const handleResume = useCallback(() => {
		dispatch({ type: 'RESUME', elapsedMs: setElapsedMs })
	}, [dispatch, setElapsedMs])

	const handleConfirm = useCallback(() => {
		if (!currentSet || isResting) return
		const { exerciseId, setType, transition } = currentSet

		// Defer CONFIRM dispatch + logging until rest completes — store pending data
		pendingConfirmRef.current = {
			exerciseId,
			weightKg: state.editWeight ?? 0,
			reps: state.editReps,
			setType,
			transition
		}
		setSetElapsedMs(0)
		setActiveExerciseId(exerciseId)

		restTimer.start(getRestDuration(exerciseId, state.editReps, setType, transition), setType, transition)
	}, [currentSet, isResting, state.editWeight, state.editReps, setActiveExerciseId, getRestDuration, restTimer])

	const advanceToNextSet = useCallback(() => {
		const pending = pendingConfirmRef.current
		if (!pending) return
		pendingConfirmRef.current = null
		dispatch({ type: 'CONFIRM' })
		onConfirmSet(pending)
	}, [dispatch, onConfirmSet])

	const handleUndo = useCallback(() => {
		if (pendingConfirmRef.current) {
			// Undo during rest — nothing was logged yet, just cancel
			pendingConfirmRef.current = null
			restTimer.dismiss()
			setSetElapsedMs(0)
		} else {
			dispatch({ type: 'UNDO' })
			restTimer.dismiss()
			setSetElapsedMs(0)
			onUndoSet()
		}
	}, [dispatch, restTimer, onUndoSet])

	const handleDismissTimer = useCallback(() => {
		advanceToNextSet()
		restTimer.dismiss()
	}, [advanceToNextSet, restTimer])

	const handleStopSet = useCallback(() => {
		dispatch({ type: 'STOP_SET' })
		setSetElapsedMs(0)
	}, [dispatch])

	const handleNavigate = useCallback((direction: -1 | 1) => dispatch({ type: 'NAVIGATE', direction }), [dispatch])

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
				} else if (state.isPaused) {
					handleResume()
				} else if (state.setStartedAt !== null) {
					handleConfirm()
				} else {
					handleStartSet()
				}
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [
		handleConfirm,
		handleDismissTimer,
		handleStartSet,
		handleResume,
		isResting,
		state.setStartedAt,
		state.isPaused,
		onClose
	])

	const isDoingSet = state.setStartedAt !== null && !isResting && !state.isPaused
	const isSetPaused = state.setStartedAt !== null && state.isPaused && !isResting
	const hasConfirmedSets = state.locallyConfirmed.length > 0

	return (
		<div className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-contain bg-surface-0">
			<div className="mx-auto flex h-full w-full max-w-sm flex-col">
				{/* Main content */}
				<div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
					{currentSet === null ? (
						/* All sets complete */
						<>
							<div className="flex size-16 items-center justify-center rounded-full bg-success/20">
								<Dumbbell className="size-8 text-success" />
							</div>
							<h2 className="font-semibold text-ink text-lg">All sets complete!</h2>
							<div className="font-mono text-ink-muted text-sm tabular-nums">
								{formatTime((Date.now() - session.startedAt) / 1000)} elapsed
							</div>
							<Button onClick={onClose} className="w-full">
								Close
							</Button>
						</>
					) : (
						<>
							<h2 className="font-mono text-ink-muted text-sm tabular-nums">
								{currentSet.itemIndex + 1} / {exerciseGroups.length}
							</h2>
							{/* Exercise name with nav arrows */}
							<div className="flex w-full items-center justify-center gap-2">
								<button
									type="button"
									className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
									onClick={() => handleNavigate(-1)}
								>
									<ChevronLeft className="size-5" />
								</button>
								<h2 className="font-semibold text-ink text-xl">{currentSet.exerciseName}</h2>
								<button
									type="button"
									className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
									onClick={() => handleNavigate(1)}
								>
									<ChevronRight className="size-5" />
								</button>
							</div>

							{/* Badge + set progress + target */}
							<div className="flex flex-col items-center gap-1">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											'rounded-full px-2 py-0.5 font-mono text-xs',
											SET_TYPE_STYLES[currentSet.setType]
										)}
									>
										{currentSet.setType}
									</span>
									<span className="font-mono text-ink-muted text-sm tabular-nums">
										Set {currentSet.setNumber} of {currentSet.totalSets}
									</span>
								</div>
								<span className="font-mono text-ink text-lg tabular-nums">
									{currentSet.weightKg ?? 0}kg &times; {currentSet.reps} reps
								</span>
							</div>

							{/* Timer ring — always rendered, content crossfades */}
							<TimerRing
								remaining={isResting ? preciseRemaining : 0}
								total={isResting ? restTimer.total : 0}
								setType={restTimer.setType ?? 'working'}
							>
								{isResting ? (
									<>
										<span className="text-ink-faint text-xs">
											{restTimer.isTransition ? 'Transition' : 'Rest'}
										</span>
										<span
											className={cn(
												'font-mono text-5xl tabular-nums',
												preciseRemaining <= 0 ? 'text-destructive' : 'text-ink'
											)}
										>
											{formatTime(preciseRemaining)}
										</span>
										<span className="font-mono text-ink-faint text-xs tabular-nums">
											{formatTime(restTimer.total - preciseRemaining)} rested
										</span>
									</>
								) : (
									<>
										{isSetPaused && <span className="text-ink-faint text-xs">Paused</span>}
										<span
											className={cn(
												'font-mono text-4xl tabular-nums',
												isSetPaused ? 'text-ink-muted' : 'text-ink'
											)}
										>
											{formatTime(setElapsedMs / 1000)}
										</span>
									</>
								)}
							</TimerRing>

							{/* Weight x Reps inputs — editable during rest (set hasn't been logged yet) */}
							<div className="flex items-center gap-3">
								<NumberInput
									className="w-28 text-center text-2xl"
									value={state.editWeight ?? ''}
									placeholder="kg"
									unit="kg"
									onChange={e => {
										const v = Number.parseFloat(e.target.value)
										dispatch({ type: 'EDIT_WEIGHT', weight: Number.isNaN(v) ? null : v })
									}}
									step={2.5}
									min={0}
								/>
								<span className="text-ink-faint text-xl">&times;</span>
								<NumberInput
									className="w-24 text-center text-2xl"
									value={state.editReps}
									onChange={e => {
										const v = Number.parseInt(e.target.value, 10)
										if (!Number.isNaN(v) && v >= 0) dispatch({ type: 'EDIT_REPS', reps: v })
									}}
									unit="r"
									step={1}
									min={0}
								/>
							</div>

							{/* Action buttons */}
							<div className="flex w-full items-center gap-2">
								{isDoingSet && (
									<Button variant="outline" size="icon" onClick={handlePause}>
										<Pause className="size-4" />
									</Button>
								)}
								{isSetPaused && (
									<Button variant="outline" size="icon" onClick={handleStopSet}>
										<Square className="size-4" />
									</Button>
								)}
								{!(isDoingSet || isSetPaused) && (hasConfirmedSets || pendingConfirmRef.current) && (
									<Button variant="outline" size="icon" onClick={handleUndo}>
										<Undo2 className="size-4" />
									</Button>
								)}
								<Button
									onClick={
										isResting
											? handleDismissTimer
											: isSetPaused
												? handleResume
												: isDoingSet
													? handleConfirm
													: handleStartSet
									}
									className="flex-1"
								>
									{isResting
										? preciseRemaining <= 0
											? 'Next Set'
											: 'Skip Rest'
										: isSetPaused
											? 'Resume'
											: isDoingSet
												? 'Done'
												: 'Start'}
								</Button>
							</div>

							{/* Next set preview */}
							{nextSet && (
								<div className="flex w-full items-center gap-3 rounded-md border border-edge bg-surface-1 px-3 py-2.5">
									<div className="min-w-0 flex-1">
										<div className="text-[10px] text-ink-faint">NEXT UP</div>
										<div className="font-medium text-ink text-sm">{nextSet.exerciseName}</div>
									</div>
									<span
										className={cn(
											'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
											SET_TYPE_STYLES[nextSet.setType]
										)}
									>
										{nextSet.setType}
									</span>
									<span className="font-mono text-ink text-sm tabular-nums">
										{nextSet.weightKg ?? 0}kg &times; {nextSet.reps}
									</span>
								</div>
							)}

							{currentSet !== null && (
								<Button className="w-full" variant="outline" onClick={onClose}>
									<X className="size-5" />
									Exit timer mode
								</Button>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	)
}
