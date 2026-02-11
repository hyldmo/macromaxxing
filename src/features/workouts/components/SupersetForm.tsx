import type { SetMode, SetType, TrainingGoal } from '@macromaxxing/db'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type FC, useState } from 'react'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { totalVolume } from '../utils/formulas'
import type { PlannedSet } from './ExerciseSetForm'
import { PlannedSetRow, SetRow } from './SetRow'

type Log = RouterOutput['workout']['getSession']['logs'][number]
type Exercise = Log['exercise']

export interface SupersetFormProps {
	group: number
	exercises: Array<{
		exercise: Exercise
		logs: Log[]
		plannedSets: PlannedSet[]
		setMode: SetMode
	}>
	goal: TrainingGoal
	readOnly?: boolean
	onAddSet: (data: { exerciseId: Exercise['id']; weightKg: number; reps: number; setType: SetType }) => void
	onUpdateSet: (id: Log['id'], updates: { weightKg?: number; reps?: number; rpe?: number | null }) => void
	onRemoveSet: (id: Log['id']) => void
}

export const SupersetForm: FC<SupersetFormProps> = ({
	group,
	exercises,
	readOnly,
	onAddSet,
	onUpdateSet,
	onRemoveSet
}) => {
	const [collapsed, setCollapsed] = useState(false)
	const [editableTargets, setEditableTargets] = useState<Map<string, { weight: number | null; reps: number }>>(
		new Map()
	)

	const allLogs = exercises.flatMap(e => e.logs)
	const vol = totalVolume(allLogs.filter(l => l.setType !== 'warmup'))
	const totalSets = allLogs.length
	const totalPlanned = exercises.reduce((sum, e) => sum + e.plannedSets.length, 0)

	const exerciseNames = exercises.map(e => e.exercise.name).join(' + ')

	return (
		<div className="rounded-[--radius-sm] border-2 border-edge border-l-accent bg-surface-1">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
				onClick={() => setCollapsed(!collapsed)}
			>
				{collapsed ? (
					<ChevronRight className="size-4 text-ink-faint" />
				) : (
					<ChevronDown className="size-4 text-ink-faint" />
				)}
				<span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
					SS{group}
				</span>
				<span className="min-w-0 flex-1 truncate font-medium text-ink text-sm">{exerciseNames}</span>
				<span className="ml-auto font-mono text-ink-muted text-xs tabular-nums">
					{totalSets}
					{totalPlanned > 0 ? `/${totalPlanned}` : ''} sets
					{vol > 0 && ` · ${(vol / 1000).toFixed(1)}k`}
				</span>
			</button>

			{!collapsed && (
				<div className="border-edge border-t px-3 py-2">
					{/* Render each exercise's sets in sequence */}
					{exercises.map((exData, exIdx) => {
						const { exercise, logs, plannedSets } = exData

						// Track fulfillment per set type
						const warmupLogs = logs.filter(l => l.setType === 'warmup')
						const workingLogs = logs.filter(l => l.setType === 'working')
						const backoffLogs = logs.filter(l => l.setType === 'backoff')

						const plannedWarmups = plannedSets.filter(s => s.setType === 'warmup')
						const plannedWorking = plannedSets.filter(s => s.setType === 'working')
						const plannedBackoffs = plannedSets.filter(s => s.setType === 'backoff')

						const remainingWarmups = plannedWarmups.slice(warmupLogs.length)
						const remainingWorking = plannedWorking.slice(workingLogs.length)
						const remainingBackoffs = plannedBackoffs.slice(backoffLogs.length)
						const remainingPlanned = [...remainingWarmups, ...remainingWorking, ...remainingBackoffs]

						return (
							<div key={exercise.id} className={cn(exIdx > 0 && 'mt-3 border-edge border-t pt-3')}>
								<div className="mb-1 flex items-center gap-2">
									<span className="font-medium text-ink text-sm">{exercise.name}</span>
									<span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
										{exercise.type}
									</span>
									<span className="ml-auto font-mono text-ink-muted text-xs tabular-nums">
										{logs.length}/{plannedSets.length}
									</span>
								</div>

								{/* Logged sets */}
								<div className="space-y-0.5">
									{logs.map(log => (
										<SetRow key={log.id} log={log} onUpdate={onUpdateSet} onRemove={onRemoveSet} />
									))}
								</div>

								{/* Remaining planned sets */}
								{!readOnly && remainingPlanned.length > 0 && (
									<div className="mt-1 space-y-0.5">
										{remainingPlanned.map(planned => {
											const key = `${exercise.id}-${planned.setType}-${planned.setNumber}`
											const overrides = editableTargets.get(key)
											return (
												<PlannedSetRow
													key={key}
													setNumber={planned.setNumber}
													weightKg={
														overrides?.weight !== undefined
															? overrides.weight
															: planned.weightKg
													}
													reps={overrides?.reps !== undefined ? overrides.reps : planned.reps}
													setType={planned.setType}
													done={false}
													onConfirm={(weight, reps) => {
														onAddSet({
															exerciseId: exercise.id,
															weightKg: weight,
															reps,
															setType: planned.setType
														})
														setEditableTargets(prev => {
															const next = new Map(prev)
															next.delete(key)
															return next
														})
													}}
													onWeightChange={w =>
														setEditableTargets(prev => {
															const next = new Map(prev)
															const existing = next.get(key)
															next.set(key, {
																weight: w,
																reps: existing?.reps ?? planned.reps
															})
															return next
														})
													}
													onRepsChange={r =>
														setEditableTargets(prev => {
															const next = new Map(prev)
															const existing = next.get(key)
															next.set(key, {
																weight:
																	existing?.weight !== undefined
																		? existing.weight
																		: planned.weightKg,
																reps: r
															})
															return next
														})
													}
												/>
											)
										})}
									</div>
								)}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
