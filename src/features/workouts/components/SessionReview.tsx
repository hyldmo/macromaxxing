import type { TypeIDString } from '@macromaxxing/db'
import { ArrowRight, Check, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button, Modal, Spinner, Switch } from '~/components/ui'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
import { useRestTimer } from '../RestTimerContext'
import { computeDivergences, exerciseE1rmStats } from '../utils/formulas'

type Session = RouterOutput['workout']['getSession']
type Template = NonNullable<Session['workout']>
type Log = Session['logs'][number]

interface ExtraDef {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	logs: Log[]
}

export interface SessionReviewProps {
	session: Session
	template: Template
	extraExercises: ExtraDef[]
	onClose: () => void
}

export const SessionReview: FC<SessionReviewProps> = ({ session, template, extraExercises, onClose }) => {
	const utils = trpc.useUtils()
	const { setSession } = useRestTimer()

	const divergences = useMemo(
		() => computeDivergences(session.logs, template.exercises, template.trainingGoal ?? 'hypertrophy'),
		[session.logs, template.exercises, template.trainingGoal]
	)

	const exerciseStats = useMemo(() => exerciseE1rmStats(session.logs), [session.logs])

	// Toggle states: on for improvements, off for decreases by default
	const [updates, setUpdates] = useState<Map<string, boolean>>(
		() => new Map(divergences.map(d => [d.exerciseId, d.status !== 'below_range']))
	)
	const [addToTemplate, setAddToTemplate] = useState<Map<string, boolean>>(
		() => new Map(extraExercises.map(e => [e.exerciseId, true]))
	)

	const completeMutation = trpc.workout.completeSession.useMutation({
		onSuccess: () => {
			setSession(null)
			utils.workout.getSession.invalidate({ id: session.id })
			utils.workout.listSessions.invalidate()
			utils.workout.listWorkouts.invalidate()
			utils.workout.coverageStats.invalidate()
			onClose()
		}
	})

	function handleComplete() {
		const templateUpdates = divergences
			.filter(d => updates.get(d.exerciseId))
			.map(d => ({
				exerciseId: d.exerciseId,
				targetSets: d.actual.sets,
				targetRepsMin: d.status === 'improved' && d.suggestedWeight ? d.planned.repsMin : d.actual.reps,
				targetRepsMax: d.planned.repsMax,
				targetWeight:
					d.status === 'improved' && d.suggestedWeight
						? d.suggestedWeight
						: d.actual.weight > 0
							? d.actual.weight
							: null
			}))

		const addExercises = extraExercises
			.filter(e => addToTemplate.get(e.exerciseId))
			.map(e => {
				const workingLogs = e.logs.filter(l => l.setType === 'working')
				if (workingLogs.length === 0) {
					return {
						exerciseId: e.exerciseId,
						targetSets: 3,
						targetRepsMin: 8,
						targetRepsMax: 12,
						targetWeight: null
					}
				}
				const bestSet = workingLogs.reduce((best, l) =>
					l.weightKg > best.weightKg || (l.weightKg === best.weightKg && l.reps > best.reps) ? l : best
				)
				return {
					exerciseId: e.exerciseId,
					targetSets: workingLogs.length,
					targetRepsMin: bestSet.reps,
					targetRepsMax: bestSet.reps,
					targetWeight: bestSet.weightKg > 0 ? bestSet.weightKg : null
				}
			})

		completeMutation.mutate({
			id: session.id,
			templateUpdates: templateUpdates.length > 0 ? templateUpdates : undefined,
			addExercises: addExercises.length > 0 ? addExercises : undefined
		})
	}

	const hasDivergences = divergences.length > 0 || extraExercises.length > 0

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
					<p className="mb-2 text-ink-muted text-xs">Estimated 1RM</p>
					<div className="space-y-1.5">
						{exerciseStats.map(s => (
							<div key={s.name} className="flex items-baseline justify-between gap-2">
								<span className="min-w-0 truncate text-ink text-sm">{s.name}</span>
								<div className="flex shrink-0 items-baseline gap-2 font-mono text-[11px] tabular-nums">
									<span className="text-ink-faint">
										{s.weightKg}kg × {s.reps}
									</span>
									<span className="font-semibold text-accent">{s.e1rm.toFixed(0)}kg</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{!hasDivergences ? (
				<p className="mb-4 text-ink-muted text-sm">All sets matched the plan. Complete the session?</p>
			) : (
				<div className="mb-4 space-y-3">
					{divergences.length > 0 && (
						<div className="space-y-2">
							<p className="text-ink-muted text-xs">Update template targets?</p>
							{divergences.map(d => (
								<div
									key={d.exerciseId}
									className="flex items-center gap-2 rounded-sm border border-edge bg-surface-0 px-3 py-2"
								>
									<Switch
										checked={updates.get(d.exerciseId) ?? false}
										onChange={(v: boolean) =>
											setUpdates(prev => new Map(prev).set(d.exerciseId, v))
										}
									/>
									<div className="min-w-0 flex-1">
										<div className="text-ink text-sm">{d.exerciseName}</div>
										<div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
											<span className="text-ink-faint">
												{d.planned.sets}×{d.planned.repsMin}-{d.planned.repsMax}
												{d.planned.weight != null && ` @${d.planned.weight}kg`}
											</span>
											<ArrowRight className="size-3 text-ink-faint" />
											<span
												className={cn(
													d.status === 'improved'
														? 'text-success'
														: d.status === 'below_range'
															? 'text-macro-kcal'
															: 'text-ink'
												)}
											>
												{d.actual.sets}×{d.actual.reps}
												{d.actual.weight > 0 && ` @${d.actual.weight}kg`}
												{d.suggestedWeight != null && ` → ${d.suggestedWeight}kg`}
											</span>
										</div>
									</div>
								</div>
							))}
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
