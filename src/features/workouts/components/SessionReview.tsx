import type { TypeIDString } from '@macromaxxing/db'
import { ArrowRight, Check, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Modal } from '~/components/ui/Modal'
import { Spinner } from '~/components/ui/Spinner'
import { Switch } from '~/components/ui/Switch'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'

type Session = RouterOutput['workout']['getSession']
type Template = NonNullable<Session['workout']>
type Log = Session['logs'][number]

interface ExtraDef {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	logs: Log[]
}

interface Divergence {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	planned: { sets: number; reps: number; weight: number | null }
	actual: { sets: number; avgReps: number; avgWeight: number }
	improved: boolean
}

export interface SessionReviewProps {
	session: Session
	template: Template
	extraExercises: ExtraDef[]
	onClose: () => void
}

export const SessionReview: FC<SessionReviewProps> = ({ session, template, extraExercises, onClose }) => {
	const utils = trpc.useUtils()

	const divergences = useMemo(() => {
		const result: Divergence[] = []

		for (const we of template.exercises) {
			const logs = session.logs.filter(l => l.exerciseId === we.exerciseId && l.setType === 'working')
			if (logs.length === 0) continue

			const avgWeight = logs.reduce((s, l) => s + l.weightKg, 0) / logs.length
			const avgReps = logs.reduce((s, l) => s + l.reps, 0) / logs.length

			const weightDiff = we.targetWeight != null ? Math.abs(avgWeight - we.targetWeight) : 0
			const repsDiff = Math.abs(avgReps - we.targetReps)
			const setsDiff = Math.abs(logs.length - we.targetSets)

			if (weightDiff > 0.1 || repsDiff > 0.5 || setsDiff > 0) {
				const improved =
					avgWeight >= (we.targetWeight ?? 0) && avgReps >= we.targetReps && logs.length >= we.targetSets
				result.push({
					exerciseId: we.exerciseId,
					exerciseName: we.exercise.name,
					planned: { sets: we.targetSets, reps: we.targetReps, weight: we.targetWeight },
					actual: {
						sets: logs.length,
						avgReps: Math.round(avgReps * 10) / 10,
						avgWeight: Math.round(avgWeight * 10) / 10
					},
					improved
				})
			}
		}

		return result
	}, [session.logs, template.exercises])

	// Toggle states: on for improvements, off for decreases by default
	const [updates, setUpdates] = useState<Map<string, boolean>>(
		() => new Map(divergences.map(d => [d.exerciseId, d.improved]))
	)
	const [addToTemplate, setAddToTemplate] = useState<Map<string, boolean>>(
		() => new Map(extraExercises.map(e => [e.exerciseId, true]))
	)

	const completeMutation = trpc.workout.completeSession.useMutation({
		onSuccess: () => {
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
				targetReps: Math.round(d.actual.avgReps),
				targetWeight: d.actual.avgWeight > 0 ? d.actual.avgWeight : null
			}))

		const addExercises = extraExercises
			.filter(e => addToTemplate.get(e.exerciseId))
			.map(e => {
				const workingLogs = e.logs.filter(l => l.setType === 'working')
				const avgWeight = workingLogs.length
					? workingLogs.reduce((s, l) => s + l.weightKg, 0) / workingLogs.length
					: 0
				const avgReps = workingLogs.length
					? Math.round(workingLogs.reduce((s, l) => s + l.reps, 0) / workingLogs.length)
					: 8
				return {
					exerciseId: e.exerciseId,
					targetSets: workingLogs.length || 3,
					targetReps: avgReps,
					targetWeight: avgWeight > 0 ? Math.round(avgWeight * 10) / 10 : null
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
									className="flex items-center gap-2 rounded-[--radius-sm] border border-edge bg-surface-0 px-3 py-2"
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
												{d.planned.sets}×{d.planned.reps}
												{d.planned.weight != null && ` @${d.planned.weight}kg`}
											</span>
											<ArrowRight className="size-3 text-ink-faint" />
											<span className={cn(d.improved ? 'text-success' : 'text-macro-kcal')}>
												{d.actual.sets}×{d.actual.avgReps}
												{d.actual.avgWeight > 0 && ` @${d.actual.avgWeight}kg`}
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
									className="flex items-center gap-2 rounded-[--radius-sm] border border-edge bg-surface-0 px-3 py-2"
								>
									<Switch
										checked={addToTemplate.get(e.exerciseId) ?? false}
										onChange={(v: boolean) =>
											setAddToTemplate(prev => new Map(prev).set(e.exerciseId, v))
										}
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
