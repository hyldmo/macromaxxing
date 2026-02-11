import type { Exercise, SetType } from '@macromaxxing/db'
import { ChevronLeft, ChevronRight, Dumbbell, Pause, Square, X } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button, NumberInput } from '~/components/ui'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { useRestTimer } from '../RestTimerContext'
import type { PlannedSet } from './ExerciseSetForm'
import { TimerRing } from './TimerRing'

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

interface CurrentSet {
	exerciseId: Exercise['id']
	exerciseName: string
	setType: SetType
	weightKg: number | null
	reps: number
	setNumber: number
	totalSets: number
	transition: boolean
	itemIndex: number
}

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
}

function findCurrentSet(exerciseGroups: RenderItem[], focusedIndex: number | null): CurrentSet | null {
	// If focused on a specific item, try that first
	if (focusedIndex !== null && focusedIndex < exerciseGroups.length) {
		const result = findPendingInItem(exerciseGroups[focusedIndex], focusedIndex)
		if (result) return result
	}
	// Fallback: first pending across all items
	for (let itemIdx = 0; itemIdx < exerciseGroups.length; itemIdx++) {
		const result = findPendingInItem(exerciseGroups[itemIdx], itemIdx)
		if (result) return result
	}
	return null
}

function findPendingInItem(item: RenderItem, itemIdx: number): CurrentSet | null {
	if (item.type === 'standalone') {
		if (item.logs.length < item.planned.length) {
			const planned = item.planned[item.logs.length]
			return {
				exerciseId: item.exerciseId,
				exerciseName: item.exercise.name,
				setType: planned.setType,
				weightKg: planned.weightKg,
				reps: planned.reps,
				setNumber: item.logs.length + 1,
				totalSets: item.planned.length,
				transition: false,
				itemIndex: itemIdx
			}
		}
	} else {
		return findPendingInSuperset(item, itemIdx, 0)
	}
	return null
}

function findNextSet(exerciseGroups: RenderItem[], current: CurrentSet | null): CurrentSet | null {
	if (!current) return null

	for (let itemIdx = 0; itemIdx < exerciseGroups.length; itemIdx++) {
		const item = exerciseGroups[itemIdx]

		if (item.type === 'standalone') {
			if (item.logs.length < item.planned.length) {
				const planned = item.planned[item.logs.length]
				const candidate: CurrentSet = {
					exerciseId: item.exerciseId,
					exerciseName: item.exercise.name,
					setType: planned.setType,
					weightKg: planned.weightKg,
					reps: planned.reps,
					setNumber: item.logs.length + 1,
					totalSets: item.planned.length,
					transition: false,
					itemIndex: itemIdx
				}
				// Skip if this is the same as current
				if (candidate.exerciseId === current.exerciseId && candidate.setNumber === current.setNumber) continue
				return candidate
			}
		} else {
			// For superset, find pending entries — skip the first one if it matches current
			const result = findPendingInSuperset(item, itemIdx, 0)
			if (result) {
				if (result.exerciseId === current.exerciseId && result.setNumber === current.setNumber) {
					// Skip this one, find the next
					const next = findPendingInSuperset(item, itemIdx, 1)
					if (next) return next
					continue
				}
				return result
			}
		}
	}
	return null
}

interface RoundSet {
	exerciseId: Exercise['id']
	exerciseName: string
	planned: PlannedSet
	log: SessionLog | null
	exerciseIndex: number
}

function findPendingInSuperset(
	item: Extract<RenderItem, { type: 'superset' }>,
	itemIdx: number,
	skip: number
): CurrentSet | null {
	const { exercises } = item

	// Build phases (same algorithm as SupersetForm)
	const exercisePhases = exercises.map((exData, exIdx) => {
		const warmupLogs = exData.logs.filter(l => l.setType === 'warmup')
		const workingLogs = exData.logs.filter(l => l.setType === 'working')
		const backoffLogs = exData.logs.filter(l => l.setType === 'backoff')

		const plannedWarmups = exData.planned.filter(s => s.setType === 'warmup')
		const plannedWorking = exData.planned.filter(s => s.setType === 'working')
		const plannedBackoffs = exData.planned.filter(s => s.setType === 'backoff')

		const warmups: RoundSet[] = plannedWarmups.map((p, i) => ({
			exerciseId: exData.exerciseId,
			exerciseName: exData.exercise.name,
			planned: p,
			log: warmupLogs[i] ?? null,
			exerciseIndex: exIdx
		}))
		const working: RoundSet[] = plannedWorking.map((p, i) => ({
			exerciseId: exData.exerciseId,
			exerciseName: exData.exercise.name,
			planned: p,
			log: workingLogs[i] ?? null,
			exerciseIndex: exIdx
		}))
		const backoffs: RoundSet[] = plannedBackoffs.map((p, i) => ({
			exerciseId: exData.exerciseId,
			exerciseName: exData.exercise.name,
			planned: p,
			log: backoffLogs[i] ?? null,
			exerciseIndex: exIdx
		}))

		return { warmups, working, backoffs }
	})

	// Build rounds
	const rounds: Array<{ setType: SetType; sets: RoundSet[] }> = []

	const maxWarmups = Math.max(0, ...exercisePhases.map(e => e.warmups.length))
	for (let i = 0; i < maxWarmups; i++) {
		const sets = exercisePhases.filter(e => i < e.warmups.length).map(e => e.warmups[i])
		rounds.push({ setType: 'warmup', sets })
	}
	const maxWorking = Math.max(0, ...exercisePhases.map(e => e.working.length))
	for (let i = 0; i < maxWorking; i++) {
		const sets = exercisePhases.filter(e => i < e.working.length).map(e => e.working[i])
		rounds.push({ setType: 'working', sets })
	}
	const maxBackoffs = Math.max(0, ...exercisePhases.map(e => e.backoffs.length))
	for (let i = 0; i < maxBackoffs; i++) {
		const sets = exercisePhases.filter(e => i < e.backoffs.length).map(e => e.backoffs[i])
		rounds.push({ setType: 'backoff', sets })
	}

	// Walk rounds to find pending entries
	let skipped = 0
	const totalSets = exercises.reduce((sum, e) => sum + e.planned.length, 0)
	const completedSets = exercises.reduce((sum, e) => sum + e.logs.length, 0)

	for (const round of rounds) {
		for (let setIdx = 0; setIdx < round.sets.length; setIdx++) {
			const entry = round.sets[setIdx]
			if (entry.log !== null) continue
			if (skipped < skip) {
				skipped++
				continue
			}
			const isLastInRound = setIdx === round.sets.length - 1
			return {
				exerciseId: entry.exerciseId,
				exerciseName: entry.exerciseName,
				setType: entry.planned.setType,
				weightKg: entry.planned.weightKg,
				reps: entry.planned.reps,
				setNumber: completedSets + skipped + 1,
				totalSets,
				transition: !isLastInRound,
				itemIndex: itemIdx
			}
		}
	}

	return null
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function exerciseProgress(exerciseGroups: RenderItem[]): { completed: number; total: number } {
	let completed = 0
	let total = 0
	for (const item of exerciseGroups) {
		if (item.type === 'standalone') {
			total++
			if (item.logs.length >= item.planned.length && item.planned.length > 0) completed++
		} else {
			for (const e of item.exercises) {
				total++
				if (e.logs.length >= e.planned.length && e.planned.length > 0) completed++
			}
		}
	}
	return { completed, total }
}

export const TimerMode: FC = () => {
	const { exerciseGroups, setActiveExerciseId, session, onConfirmSet } = useOutletContext<TimerModeContext>()
	const { sessionId } = useParams<{ sessionId: string }>()
	const navigate = useNavigate()
	const onClose = useCallback(() => navigate('..'), [navigate])

	const restTimer = useRestTimer()

	// Activate nav elapsed display on mount
	useEffect(() => {
		if (sessionId) {
			restTimer.setSession({ id: sessionId, startedAt: session.startedAt })
		}
	}, [sessionId, session.startedAt, restTimer.setSession, restTimer])

	// Auto-dismiss rest timer when countdown reaches 0
	useEffect(() => {
		if (restTimer.isRunning && restTimer.remaining <= 0) {
			restTimer.dismiss()
		}
	}, [restTimer.isRunning, restTimer.remaining, restTimer])

	const [editWeight, setEditWeight] = useState<number | null>(null)
	const [editReps, setEditReps] = useState<number>(0)
	const [preciseRemaining, setPreciseRemaining] = useState(0)
	const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null)
	const [setStartedAt, setSetStartedAt] = useState<number | null>(null)
	const [setElapsedMs, setSetElapsedMs] = useState(0)
	const [isPaused, setIsPaused] = useState(false)
	const rafRef = useRef(0)

	// High-frequency timer — only runs when set is active (not paused) or rest countdown is running
	const needsRaf = (setStartedAt !== null && !isPaused) || restTimer.endAt !== null
	useEffect(() => {
		if (!needsRaf) return
		const tick = () => {
			if (restTimer.endAt !== null) {
				setPreciseRemaining((restTimer.endAt - Date.now()) / 1000)
			}
			if (setStartedAt !== null && !isPaused) {
				setSetElapsedMs(Date.now() - setStartedAt)
			}
			rafRef.current = requestAnimationFrame(tick)
		}
		rafRef.current = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(rafRef.current)
	}, [needsRaf, restTimer.endAt, setStartedAt, isPaused])

	const currentSet = useMemo(
		() => findCurrentSet(exerciseGroups, focusedItemIndex),
		[exerciseGroups, focusedItemIndex]
	)
	const nextSet = useMemo(() => findNextSet(exerciseGroups, currentSet), [exerciseGroups, currentSet])
	const _progress = useMemo(() => exerciseProgress(exerciseGroups), [exerciseGroups])

	// Sync editable state when current set identity changes
	const setIdentity = currentSet ? `${currentSet.exerciseId}-${currentSet.setNumber}-${currentSet.setType}` : null
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync only when set identity changes, not on every weight/reps edit
	useEffect(() => {
		if (currentSet) {
			setEditWeight(currentSet.weightKg)
			setEditReps(currentSet.reps)
		}
		setSetStartedAt(null)
		setIsPaused(false)
	}, [setIdentity])

	const handleStartSet = useCallback(() => {
		setSetStartedAt(Date.now())
		setIsPaused(false)
	}, [])

	const handlePause = useCallback(() => {
		setIsPaused(true)
	}, [])

	const handleResume = useCallback(() => {
		// Adjust startedAt so elapsed continues from where it was
		setSetStartedAt(Date.now() - setElapsedMs)
		setIsPaused(false)
	}, [setElapsedMs])

	const handleConfirm = useCallback(() => {
		if (!currentSet || restTimer.isRunning) return
		onConfirmSet({
			exerciseId: currentSet.exerciseId,
			weightKg: editWeight ?? 0,
			reps: editReps,
			setType: currentSet.setType,
			transition: currentSet.transition
		})
		setSetStartedAt(null)
		setIsPaused(false)
		setActiveExerciseId(currentSet.exerciseId)
		setFocusedItemIndex(null)
	}, [currentSet, editWeight, editReps, restTimer.isRunning, onConfirmSet, setActiveExerciseId])

	const handleDismissTimer = useCallback(() => {
		restTimer.dismiss()
	}, [restTimer])

	// Navigate to previous/next exercise with pending sets
	const navigateExercise = useCallback(
		(direction: -1 | 1) => {
			if (!currentSet) return
			const idx = currentSet.itemIndex
			const searchRange = direction === 1 ? exerciseGroups.slice(idx + 1) : exerciseGroups.slice(0, idx).reverse()

			for (const item of searchRange) {
				const hasPending =
					item.type === 'standalone'
						? item.planned.length > item.logs.length
						: item.exercises.some(e => e.planned.length > e.logs.length)
				if (hasPending) {
					setFocusedItemIndex(exerciseGroups.indexOf(item))
					return
				}
			}
		},
		[currentSet, exerciseGroups]
	)

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
				if (restTimer.isRunning) {
					handleDismissTimer()
				} else if (isPaused) {
					handleResume()
				} else if (setStartedAt !== null) {
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
		restTimer.isRunning,
		setStartedAt,
		isPaused,
		onClose
	])

	const isResting = restTimer.isRunning
	const isDoingSet = setStartedAt !== null && !isResting && !isPaused
	const isSetPaused = setStartedAt !== null && isPaused && !isResting

	const timerDisplay = (() => {
		const abs = Math.abs(preciseRemaining)
		const m = Math.floor(abs / 60)
		const s = Math.floor(abs % 60)
		const cs = Math.floor((abs * 100) % 100)
		return `${preciseRemaining < 0 ? '-' : ''}${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
	})()

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-surface-0">
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
								{formatElapsed(Date.now() - session.startedAt)} elapsed
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
									onClick={() => navigateExercise(-1)}
								>
									<ChevronLeft className="size-5" />
								</button>
								<h2 className="font-semibold text-ink text-xl">{currentSet.exerciseName}</h2>
								<button
									type="button"
									className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
									onClick={() => navigateExercise(1)}
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
								{/* Ready — visible when idle */}
								<div
									className={cn(
										'absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300',
										!(isDoingSet || isSetPaused || isResting) ? 'opacity-100' : 'opacity-0'
									)}
								>
									<span className="font-mono text-4xl text-ink-muted tabular-nums">0:00</span>
								</div>
								{/* Set elapsed — visible when set active or paused */}
								<div
									className={cn(
										'absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300',
										isDoingSet || isSetPaused ? 'opacity-100' : 'opacity-0'
									)}
								>
									<span className="text-ink-faint text-xs">{isSetPaused ? 'Paused' : 'Set'}</span>
									<span
										className={cn(
											'font-mono text-4xl tabular-nums',
											isSetPaused ? 'text-ink-muted' : 'text-ink'
										)}
									>
										{formatElapsed(setElapsedMs)}
									</span>
								</div>
								{/* Countdown — visible when resting */}
								<div
									className={cn(
										'absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300',
										isResting ? 'opacity-100' : 'opacity-0'
									)}
								>
									<span className="text-ink-faint text-xs">
										{restTimer.isTransition ? 'Transition' : 'Rest'}
									</span>
									<span
										className={cn(
											'font-mono text-5xl tabular-nums',
											preciseRemaining <= 0 ? 'text-destructive' : 'text-ink'
										)}
									>
										{timerDisplay}
									</span>
								</div>
							</TimerRing>

							{/* Weight x Reps inputs */}
							<div className="flex items-center gap-3">
								<NumberInput
									className="w-28 text-center text-2xl"
									value={editWeight ?? ''}
									placeholder="kg"
									unit="kg"
									onChange={e => {
										const v = Number.parseFloat(e.target.value)
										setEditWeight(Number.isNaN(v) ? null : v)
									}}
									step={2.5}
									min={0}
								/>
								<span className="text-ink-faint text-xl">&times;</span>
								<NumberInput
									className="w-24 text-center text-2xl"
									value={editReps}
									onChange={e => {
										const v = Number.parseInt(e.target.value, 10)
										if (!Number.isNaN(v) && v >= 0) setEditReps(v)
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
									<Button
										variant="outline"
										size="icon"
										onClick={() => {
											setSetStartedAt(null)
											setIsPaused(false)
										}}
									>
										<Square className="size-4" />
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
									{isResting ? 'Skip Rest' : isSetPaused ? 'Resume' : isDoingSet ? 'Done' : 'Start'}
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
