import type { Exercise, SetType } from '@macromaxxing/db'
import {
	ArrowLeftRight,
	ChevronLeft,
	ChevronRight,
	Dumbbell,
	HelpCircle,
	Minimize2,
	NotebookPen,
	Pause,
	Square,
	Undo2
} from 'lucide-react'
import type { FC } from 'react'
import { Button, ButtonGroup, NumberInput } from '~/components/ui'
import { cn, effectiveSetWeightKg, type FlatSet, formatTimer, SET_TYPE_STYLES } from '~/lib'
import { SecondaryTimer } from './SecondaryTimer'
import { TimerRing } from './TimerRing'

export interface TimerModeViewProps {
	/** When true, full-viewport overlay (real timer mode). When false, inline card (demo / landing). */
	fixed?: boolean

	/** Total exercise count for "Exercise N/M" header. */
	exerciseGroupCount: number

	/** Current set descriptor — null when session is complete. */
	currentSet: FlatSet | null
	/** Next pending set after current — for the "Next up" preview. */
	nextSet: FlatSet | null

	/** Phase booleans (precomputed by container). */
	isResting: boolean
	isDoingSet: boolean
	isSetPaused: boolean
	isInSuperset: boolean
	hasConfirmedSets: boolean
	hasNotes: boolean

	/** Live timer values. */
	setElapsedSec: number
	restRemainingSec: number
	restTotalSec: number
	restSetType: SetType
	roundStartedAt: number | null
	/** Used for the "All sets complete" elapsed readout. */
	sessionElapsedSec: number

	/** Editable weight + reps for the current set. */
	weight: number | null
	reps: number
	bodyWeightKg?: number | null

	/** Callbacks (all optional → safe for inert demo surfaces). */
	onClose?: () => void
	onOpenNotes?: () => void
	onOpenGuide?: (exerciseId: Exercise['id'], exerciseName: string) => void
	onNavigate?: (direction: -1 | 1) => void
	onNavigateSet?: (direction: -1 | 1) => void
	onConfirm?: () => void
	onStartSet?: () => void
	onPause?: () => void
	onResume?: () => void
	onStopSet?: () => void
	onUndo?: () => void
	onDismissTimer?: () => void
	onEditWeight?: (kg: number | null) => void
	onEditReps?: (reps: number) => void
}

export const TimerModeView: FC<TimerModeViewProps> = ({
	fixed = false,
	exerciseGroupCount,
	currentSet,
	nextSet,
	isResting,
	isDoingSet,
	isSetPaused,
	isInSuperset,
	hasConfirmedSets,
	hasNotes,
	setElapsedSec,
	restRemainingSec,
	restTotalSec,
	restSetType,
	roundStartedAt,
	sessionElapsedSec,
	weight,
	reps,
	bodyWeightKg,
	onClose,
	onOpenNotes,
	onOpenGuide,
	onNavigate,
	onNavigateSet,
	onConfirm,
	onStartSet,
	onPause,
	onResume,
	onStopSet,
	onUndo,
	onDismissTimer,
	onEditWeight,
	onEditReps
}) => {
	const displayWeight = (set: FlatSet | null, addedKg: number | null): number => {
		if (!set) return 0
		if (set.bwMultiplier <= 0) return addedKg ?? set.weightKg ?? 0
		return effectiveSetWeightKg(set.bwMultiplier, bodyWeightKg ?? null, addedKg ?? set.weightKg ?? 0)
	}

	const currentLoadKg = displayWeight(currentSet, weight)
	const isBwInput = (currentSet?.bwMultiplier ?? 0) > 0

	// Reset to the app's default sans font so the view looks identical when mounted
	// on surfaces that set a different font (e.g. landing page uses font-display).
	const wrapperClass = fixed
		? 'fixed inset-0 z-60 flex flex-col overflow-hidden overscroll-contain bg-surface-0 font-sans'
		: 'relative flex flex-col overflow-hidden border border-edge bg-surface-0 font-sans'

	return (
		<div className={wrapperClass}>
			<Button
				variant="ghost"
				size="icon"
				onClick={onClose}
				aria-label="Minimize timer mode"
				className="absolute top-4 left-4 rounded-full"
			>
				<Minimize2 className="size-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={onOpenNotes}
				aria-label="Open session notes"
				className="absolute top-4 right-4 rounded-full"
			>
				<NotebookPen className="size-5" />
				{hasNotes && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" aria-hidden />}
			</Button>
			<div className="mx-auto flex h-full w-full max-w-sm flex-col">
				<div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-12">
					{currentSet === null ? (
						<>
							<div className="flex size-16 items-center justify-center rounded-full bg-success/20">
								<Dumbbell className="size-8 text-success" />
							</div>
							<h2 className="font-semibold text-ink text-lg">All sets complete!</h2>
							<div className="font-mono text-ink-muted text-sm tabular-nums">
								{formatTimer(sessionElapsedSec)} elapsed
							</div>
							<Button onClick={onClose} className="w-full">
								Close
							</Button>
						</>
					) : (
						<>
							<h2 className="font-mono text-ink-muted text-sm tabular-nums">
								Exercise {currentSet.itemIndex + 1} / {exerciseGroupCount}
							</h2>
							<div className="flex w-full items-center justify-center gap-2">
								<button
									type="button"
									className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
									onClick={() => onNavigate?.(-1)}
								>
									<ChevronLeft className="size-5" />
								</button>
								<h2 className="flex items-center gap-1.5 font-semibold text-ink text-xl">
									{currentSet.exerciseName}
									<button
										type="button"
										onClick={() => onOpenGuide?.(currentSet.exerciseId, currentSet.exerciseName)}
										aria-label={`Open guide for ${currentSet.exerciseName}`}
										className="rounded-full p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
									>
										<HelpCircle className="size-4" />
									</button>
								</h2>
								<button
									type="button"
									className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
									onClick={() => onNavigate?.(1)}
								>
									<ChevronRight className="size-5" />
								</button>
							</div>

							{currentSet.note && (
								<p className="-mt-3 max-w-xs whitespace-pre-line text-balance text-center text-ink-muted text-sm">
									{currentSet.note}
								</p>
							)}

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
											onClick={() => onNavigateSet?.(-1)}
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
											onClick={() => onNavigateSet?.(1)}
											aria-label="Next set"
										>
											<ChevronRight className="size-3.5" />
										</button>
									</div>
								</div>
								<span className="font-mono text-ink text-lg tabular-nums">
									{currentLoadKg}kg &times; {currentSet.reps} reps
								</span>
							</div>

							<TimerRing
								remaining={isResting ? restRemainingSec : 0}
								total={isResting ? restTotalSec : 0}
								setType={restSetType}
							>
								{isResting ? (
									<>
										<span className="text-ink-faint text-xs">Rest</span>
										<span
											className={cn(
												'font-mono text-5xl tabular-nums',
												restRemainingSec <= 0 ? 'text-destructive' : 'text-ink'
											)}
										>
											{formatTimer(restRemainingSec)}
										</span>
										<span className="font-mono text-ink-faint text-xs tabular-nums">
											{formatTimer(restTotalSec - restRemainingSec)} rested
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
											{formatTimer(setElapsedSec)}
										</span>
										{isInSuperset && <SecondaryTimer startedAt={roundStartedAt} label="round" />}
									</>
								)}
							</TimerRing>

							<div className="flex items-center gap-3">
								<NumberInput
									className="w-28 text-center text-2xl"
									value={weight ?? ''}
									placeholder={isBwInput ? '+kg' : 'kg'}
									unit="kg"
									onChange={e => {
										const v = Number.parseFloat(e.target.value)
										onEditWeight?.(Number.isNaN(v) ? null : v)
									}}
									step={2.5}
									min={0}
								/>
								<span className="text-ink-faint text-xl">&times;</span>
								<NumberInput
									className="w-24 text-center text-2xl"
									value={reps}
									onChange={e => {
										const v = Number.parseInt(e.target.value, 10)
										if (!Number.isNaN(v) && v >= 0) onEditReps?.(v)
									}}
									unit="r"
									step={1}
									min={0}
								/>
							</div>

							<div className="flex w-full items-center gap-2">
								{isDoingSet && (
									<Button variant="outline" size="icon" onClick={onPause}>
										<Pause className="size-4" />
									</Button>
								)}
								{isSetPaused && (
									<Button variant="outline" size="icon" onClick={onStopSet}>
										<Square className="size-4" />
									</Button>
								)}
								{!(isDoingSet || isSetPaused) && hasConfirmedSets && (
									<Button variant="outline" size="icon" onClick={onUndo}>
										<Undo2 className="size-4" />
									</Button>
								)}
								<Button
									onClick={
										isResting
											? onDismissTimer
											: isSetPaused
												? onResume
												: isDoingSet
													? onConfirm
													: onStartSet
									}
									className="flex-1"
								>
									{isResting
										? restRemainingSec <= 0
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
										{displayWeight(nextSet, nextSet.weightKg)}kg &times; {nextSet.reps}
									</span>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	)
}
