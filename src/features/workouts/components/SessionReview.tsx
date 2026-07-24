import type { TypeIDString } from '@macromaxxing/db'
import { ArrowRight, Check, Pencil, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button, CopyButton, Modal, NumberInput, Spinner, Switch } from '~/components/ui'
import {
	addedWeightKg,
	cn,
	computeDivergences,
	computeMatchedExercises,
	type Divergence,
	exerciseE1rmStats,
	formatAdjustTargetsPrompt
} from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
import { useWorkoutSessionStore } from '../store'
import { E1rmTable } from './E1rmTable'

type Session = RouterOutput['workout']['getSession']
type Template = NonNullable<Session['workout']>
type Log = Session['logs'][number]

interface ExtraDef {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	logs: Log[]
}

type Target = { targetSets: number; targetReps: number; targetWeight: number | null }

function bestSetTarget(d: Divergence): Target {
	return {
		targetSets: d.actual.sets,
		targetReps: d.actual.reps,
		targetWeight: d.actual.weight > 0 ? d.actual.weight : null
	}
}

function resolveTarget(d: Divergence, custom?: Target): Target {
	if (custom) return custom
	return d.suggestion
}

function targetsMatch(
	a: { sets: number; reps: number; weight: number | null },
	b: { sets: number; reps: number; weight: number | null }
): boolean {
	return a.sets === b.sets && a.reps === b.reps && Math.abs((a.weight ?? 0) - (b.weight ?? 0)) <= 0.1
}

function formatTarget(sets: number, reps: number, weight: number | null, bwMultiplier: number): string {
	return `${sets}×${reps}${weight != null ? ` @${bwMultiplier > 0 ? '+' : ''}${weight}kg` : ''}`
}

export interface SessionReviewProps {
	session: Session
	template: Template
	extraExercises: ExtraDef[]
	bodyWeightKg: number | null
	onClose: () => void
}

export const SessionReview: FC<SessionReviewProps> = ({ session, template, extraExercises, bodyWeightKg, onClose }) => {
	const utils = trpc.useUtils()
	const reset = useWorkoutSessionStore(s => s.reset)

	const workoutGoal = template.trainingGoal ?? 'hypertrophy'

	const reviewExercises = useMemo(() => {
		const divergences = computeDivergences(session.logs, template.exercises, workoutGoal, bodyWeightKg)
		const divergenceIds = new Set(divergences.map(d => d.exerciseId))
		const matched = computeMatchedExercises(
			session.logs,
			template.exercises,
			workoutGoal,
			bodyWeightKg,
			divergenceIds
		)
		return [...divergences, ...matched]
	}, [session.logs, template.exercises, workoutGoal, bodyWeightKg])

	const exerciseStats = useMemo(() => exerciseE1rmStats(session.logs), [session.logs])

	// Toggle states: on for improvements, off for decreases and matched exercises
	const [updates, setUpdates] = useState<Map<string, boolean>>(
		() => new Map(reviewExercises.map(d => [d.exerciseId, d.improved]))
	)
	const [addToTemplate, setAddToTemplate] = useState<Map<string, boolean>>(
		() => new Map(extraExercises.map(e => [e.exerciseId, true]))
	)
	const [editing, setEditing] = useState<Set<string>>(() => new Set())
	const [customTargets, setCustomTargets] = useState<Map<string, Target>>(() => new Map())
	const completeMutation = trpc.workout.completeSession.useMutation({
		onSuccess: () => {
			reset()
			utils.workout.getSession.invalidate({ id: session.id })
			utils.workout.listSessions.invalidate()
			utils.workout.listWorkouts.invalidate()
			utils.workout.coverageStats.invalidate()
			onClose()
		}
	})

	function handleComplete() {
		const templateUpdates = reviewExercises
			.filter(d => updates.get(d.exerciseId))
			.map(d => {
				const target = resolveTarget(d, customTargets.get(d.exerciseId))
				return {
					exerciseId: d.exerciseId,
					targetSets: target.targetSets,
					targetReps: target.targetReps,
					targetWeight: target.targetWeight
				}
			})

		const addExercises = extraExercises
			.filter(e => addToTemplate.get(e.exerciseId))
			.map(e => {
				const workingLogs = e.logs.filter(l => l.setType === 'working')
				if (workingLogs.length === 0) {
					return { exerciseId: e.exerciseId, targetSets: 3, targetReps: 8, targetWeight: null }
				}
				const bestSet = workingLogs.reduce((best, l) =>
					l.weightKg > best.weightKg || (l.weightKg === best.weightKg && l.reps > best.reps) ? l : best
				)
				const bwMultiplier = workingLogs[0]?.exercise.bwMultiplier ?? 0
				const bestAddedKg = addedWeightKg(bwMultiplier, bodyWeightKg, bestSet.weightKg)
				return {
					exerciseId: e.exerciseId,
					targetSets: workingLogs.length,
					targetReps: bestSet.reps,
					targetWeight: bestAddedKg > 0 ? bestAddedKg : null
				}
			})

		completeMutation.mutate({
			id: session.id,
			templateUpdates: templateUpdates.length > 0 ? templateUpdates : undefined,
			addExercises: addExercises.length > 0 ? addExercises : undefined
		})
	}

	const hasDivergences = reviewExercises.length > 0 || extraExercises.length > 0

	return (
		<Modal className="w-full max-w-lg bg-surface-1 p-4">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="font-medium text-ink text-sm">Complete Session</h3>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="size-4" />
				</Button>
			</div>

			{exerciseStats.length > 0 && (
				<div className="mb-4 rounded-sm border border-edge bg-surface-0 p-3">
					<E1rmTable stats={exerciseStats} />
				</div>
			)}

			<div className="mb-4 flex items-center justify-between gap-2 rounded-sm border border-edge bg-surface-0 px-3 py-2">
				<p className="text-ink-muted text-xs">Let AI adjust targets from each exercise's full history</p>
				<CopyButton
					getText={() => formatAdjustTargetsPrompt(template)}
					variant="outline"
					size="sm"
					className="shrink-0 gap-1.5"
				>
					AI adjust
				</CopyButton>
			</div>

			{!hasDivergences ? (
				<p className="mb-4 text-ink-muted text-sm">All sets matched the plan. Complete the session?</p>
			) : (
				<div className="mb-4 space-y-3">
					{reviewExercises.length > 0 && (
						<div className="space-y-2">
							<p className="text-ink-muted text-xs">Update template targets?</p>
							{reviewExercises.map(d => {
								const isEditing = editing.has(d.exerciseId)
								const custom = customTargets.get(d.exerciseId)
								const {
									targetSets: sets,
									targetReps: reps,
									targetWeight: weight
								} = resolveTarget(d, custom)
								const hasDiff = !targetsMatch(
									{ sets: d.planned.sets, reps: d.planned.reps, weight: d.planned.weight },
									{ sets, reps, weight }
								)

								return (
									<div
										key={d.exerciseId}
										className="rounded-sm border border-edge bg-surface-0 px-3 py-2"
									>
										<div className="flex items-center gap-2">
											<Switch
												checked={updates.get(d.exerciseId) ?? false}
												onChange={(v: boolean) =>
													setUpdates(prev => new Map(prev).set(d.exerciseId, v))
												}
											/>
											<div className="min-w-0 flex-1">
												<div className="text-ink text-sm">{d.exerciseName}</div>
												<div className="font-mono text-[11px] tabular-nums">
													{hasDiff ? (
														<div className="flex items-center gap-1">
															<span className="text-ink-faint">
																{formatTarget(
																	d.planned.sets,
																	d.planned.reps,
																	d.planned.weight,
																	d.bwMultiplier
																)}
															</span>
															<ArrowRight className="size-3 text-ink-faint" />
															<span
																className={cn(
																	d.improved ? 'text-success' : 'text-macro-kcal'
																)}
															>
																{formatTarget(sets, reps, weight, d.bwMultiplier)}
															</span>
														</div>
													) : (
														<span className="text-ink-faint">
															{formatTarget(sets, reps, weight, d.bwMultiplier)}
														</span>
													)}
												</div>
											</div>
											<button
												type="button"
												className={cn(
													'shrink-0 rounded-sm p-1 transition-colors',
													isEditing
														? 'bg-accent/15 text-accent'
														: 'text-ink-faint hover:text-ink'
												)}
												onClick={() => {
													setEditing(prev => {
														const next = new Set(prev)
														if (next.has(d.exerciseId)) {
															next.delete(d.exerciseId)
														} else {
															next.add(d.exerciseId)
															if (!customTargets.has(d.exerciseId)) {
																setCustomTargets(p =>
																	new Map(p).set(d.exerciseId, resolveTarget(d))
																)
															}
														}
														return next
													})
												}}
											>
												<Pencil className="size-3.5" />
											</button>
										</div>
										{isEditing && (
											<div className="mt-2 space-y-2">
												<div className="flex items-center gap-2">
													<NumberInput
														className="w-14"
														value={sets}
														min={1}
														step={1}
														unit="sets"
														onChange={e => {
															const v = Number.parseInt(e.target.value, 10)
															if (!Number.isNaN(v))
																setCustomTargets(p =>
																	new Map(p).set(d.exerciseId, {
																		...(p.get(d.exerciseId) ?? resolveTarget(d)),
																		targetSets: v
																	})
																)
														}}
													/>
													<span className="text-ink-faint text-xs">×</span>
													<NumberInput
														className="w-14"
														value={reps}
														min={1}
														step={1}
														unit="reps"
														onChange={e => {
															const v = Number.parseInt(e.target.value, 10)
															if (!Number.isNaN(v))
																setCustomTargets(p =>
																	new Map(p).set(d.exerciseId, {
																		...(p.get(d.exerciseId) ?? resolveTarget(d)),
																		targetReps: v
																	})
																)
														}}
													/>
													<span className="text-ink-faint text-xs">@</span>
													<NumberInput
														className="w-20"
														value={weight ?? ''}
														min={0}
														step="auto"
														unit="kg"
														placeholder={d.bwMultiplier > 0 ? '+kg' : 'kg'}
														onChange={e => {
															const v = Number.parseFloat(e.target.value)
															setCustomTargets(p =>
																new Map(p).set(d.exerciseId, {
																	...(p.get(d.exerciseId) ?? resolveTarget(d)),
																	targetWeight: Number.isNaN(v) ? null : v
																})
															)
														}}
													/>
												</div>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-[11px]"
													onClick={() =>
														setCustomTargets(p =>
															new Map(p).set(d.exerciseId, bestSetTarget(d))
														)
													}
												>
													Use best set
												</Button>
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}

					{extraExercises.length > 0 && (
						<div className="space-y-2">
							<p className="text-ink-muted text-xs">Add to template?</p>
							{extraExercises.map(e => (
								<div
									key={e.exerciseId}
									className="flex items-center gap-2 rounded-sm border border-edge bg-surface-0 px-3 py-2"
								>
									<Switch
										checked={addToTemplate.get(e.exerciseId) ?? false}
										onChange={v => setAddToTemplate(prev => new Map(prev).set(e.exerciseId, v))}
									/>
									<div className="min-w-0 flex-1">
										<div className="text-ink text-sm">{e.exerciseName}</div>
										<div className="font-mono text-[11px] text-ink-faint tabular-nums">
											{e.logs.filter(l => l.setType === 'working').length} working sets
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			<div className="flex gap-2">
				<Button onClick={handleComplete} disabled={completeMutation.isPending}>
					{completeMutation.isPending ? (
						<>
							<Spinner className="size-4" />
							Completing...
						</>
					) : (
						<>
							<Check className="size-4" />
							Complete Session
						</>
					)}
				</Button>
				<Button variant="ghost" onClick={onClose}>
					Cancel
				</Button>
			</div>
		</Modal>
	)
}
