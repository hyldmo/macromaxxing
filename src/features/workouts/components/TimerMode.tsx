import type { Exercise, SetType } from '@macromaxxing/db'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Dumbbell, HelpCircle, Pause, Square, Undo2, X } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button, ButtonGroup, NumberInput } from '~/components/ui'
import { cn, flattenSets, formatTimer, type RenderItem, SET_TYPE_STYLES, useScrollLock } from '~/lib'
import { useElapsedTimer } from '../hooks/useElapsedTimer'
import { useWorkoutSessionStore } from '../store'
import { useWakeLock } from '../useWakeLock'
import { ExerciseGuideModal } from './ExerciseGuideModal'
import { SecondaryTimer } from './SecondaryTimer'
import { TimerRing } from './TimerRing'

export interface TimerModeContext {
	exerciseGroups: RenderItem[]
	setActiveExerciseId: (id: string | null) => void
	session: { startedAt: number; name: string | null }
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
}

export const TimerMode: FC = () => {
	const { exerciseGroups, setActiveExerciseId, session, onConfirmSet, onUpdateSet, onUndoSet, getRestDuration } =
		useOutletContext<TimerModeContext>()
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
	const isSetPaused = active?.setTimer?.isPaused && !isResting
	const hasConfirmedSets = confirmedIndices.length > 0

	return (
		<>
			<div className="fixed inset-0 z-60 flex flex-col overflow-hidden overscroll-contain bg-surface-0">
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
									{formatTimer((Date.now() - session.startedAt) / 1000)} elapsed
								</div>
								<Button onClick={onClose} className="w-full">
									Close
								</Button>
							</>
						) : (
							<>
								<h2 className="font-mono text-ink-muted text-sm tabular-nums">
									Exercise {currentSet.itemIndex + 1} / {exerciseGroups.length}
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
									<h2 className="flex items-center gap-1.5 font-semibold text-ink text-xl">
										{currentSet.exerciseName}
										<button
											type="button"
											onClick={() => setGuideOpen(true)}
											aria-label={`Open guide for ${currentSet.exerciseName}`}
											className="rounded-full p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
										>
											<HelpCircle className="size-4" />
										</button>
									</h2>
									<button
										type="button"
										className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
										onClick={() => handleNavigate(1)}
									>
										<ChevronRight className="size-5" />
									</button>
								</div>

								{/* Superset exercise strip */}
								{currentSet.superset && (
									<ButtonGroup
										options={currentSet.superset.exercises.map(ex => ({
											value: ex.exerciseId,
											label: ex.letter
										}))}
										value={currentSet.exerciseId}
										size="sm"
									/>
								)}

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
										{currentSet.superset && (
											<span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
												SS{currentSet.superset.group}
											</span>
										)}
										<div className="flex items-center gap-1">
											<button
												type="button"
												className="rounded-full p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
												onClick={() => handleNavigateSet(-1)}
												aria-label="Previous set"
											>
												<ChevronLeft className="size-3.5" />
											</button>
											<span className="font-mono text-ink-muted text-sm tabular-nums">
												Set {currentSet.setNumber} of {currentSet.totalSets}
											</span>
											<button
												type="button"
												className="rounded-full p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
												onClick={() => handleNavigateSet(1)}
												aria-label="Next set"
											>
												<ChevronRight className="size-3.5" />
											</button>
										</div>
									</div>
									<span className="font-mono text-ink text-lg tabular-nums">
										{currentSet.weightKg ?? 0}kg &times; {currentSet.reps} reps
									</span>
								</div>

								{/* Timer ring — always rendered, content crossfades */}
								<TimerRing
									remaining={isResting ? preciseRemaining : 0}
									total={isResting ? (rest?.total ?? 0) : 0}
									setType={rest?.setType ?? 'working'}
								>
									{isResting ? (
										<>
											<span className="text-ink-faint text-xs">Rest</span>
											<span
												className={cn(
													'font-mono text-5xl tabular-nums',
													preciseRemaining <= 0 ? 'text-destructive' : 'text-ink'
												)}
											>
												{formatTimer(preciseRemaining)}
											</span>
											<span className="font-mono text-ink-faint text-xs tabular-nums">
												{formatTimer((rest?.total ?? 0) - preciseRemaining)} rested
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
												{formatTimer(setElapsedMs / 1000)}
											</span>
											{isInSuperset && (
												<SecondaryTimer startedAt={_roundStartedAt} label="round" />
											)}
										</>
									)}
								</TimerRing>

								{/* Weight x Reps inputs — editable during rest to update the logged set */}
								<div className="flex items-center gap-3">
									<NumberInput
										className="w-28 text-center text-2xl"
										value={active?.weight ?? ''}
										placeholder="kg"
										unit="kg"
										onChange={e => {
											const v = Number.parseFloat(e.target.value)
											handleEditWeight(Number.isNaN(v) ? null : v)
										}}
										step={2.5}
										min={0}
									/>
									<span className="text-ink-faint text-xl">&times;</span>
									<NumberInput
										className="w-24 text-center text-2xl"
										value={active?.reps ?? 0}
										onChange={e => {
											const v = Number.parseInt(e.target.value, 10)
											if (!Number.isNaN(v) && v >= 0) handleEditReps(v)
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
									{!(isDoingSet || isSetPaused) && hasConfirmedSets && (
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
													? currentSet?.transition
														? 'Next'
														: 'Done'
													: 'Start'}
									</Button>
								</div>

								{/* Next set preview */}
								{nextSet && (
									<div className="flex w-full items-center gap-3 rounded-md border border-edge bg-surface-1 px-3 py-2.5">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
												{currentSet.transition ? (
													<>
														<ArrowLeftRight className="size-3 text-accent" />
														<span className="text-accent">SWITCH</span>
													</>
												) : (
													'NEXT UP'
												)}
											</div>
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
			{guideOpen && currentSet !== null && (
				<ExerciseGuideModal
					exerciseId={currentSet.exerciseId}
					exerciseName={currentSet.exerciseName}
					onClose={() => setGuideOpen(false)}
				/>
			)}
		</>
	)
}
