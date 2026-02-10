import { ChevronDown, ChevronRight, Plus, Zap } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { NumberInput } from '~/components/ui/NumberInput'
import type { RouterOutput } from '~/lib/trpc'
import { totalVolume } from '../utils/formulas'
import { generateBackoffSets, generateWarmupSets } from '../utils/sets'
import { PlannedSetRow, SetRow } from './SetRow'

type Log = RouterOutput['workout']['getSession']['logs'][number]
type Exercise = Log['exercise']

interface PlannedSet {
	setNumber: number
	weightKg: number | null
	reps: number
}

export interface ExerciseSetFormProps {
	exercise: Exercise
	logs: Log[]
	plannedSets?: PlannedSet[]
	onAddSet: (data: {
		exerciseId: string
		weightKg: number
		reps: number
		setType: 'warmup' | 'working' | 'backoff'
	}) => void
	onUpdateSet: (id: string, updates: { weightKg?: number; reps?: number; rpe?: number | null }) => void
	onRemoveSet: (id: string) => void
	readOnly?: boolean
}

export const ExerciseSetForm: FC<ExerciseSetFormProps> = ({
	exercise,
	logs,
	plannedSets,
	onAddSet,
	onUpdateSet,
	onRemoveSet,
	readOnly
}) => {
	const [collapsed, setCollapsed] = useState(false)
	const [newWeight, setNewWeight] = useState('')
	const [newReps, setNewReps] = useState('')
	const [editableTargets, setEditableTargets] = useState<Map<number, { weight: number | null; reps: number }>>(
		new Map()
	)

	const vol = totalVolume(logs.filter(l => l.setType !== 'warmup'))
	const workingSets = logs.filter(l => l.setType === 'working')
	const lastWorking = workingSets[workingSets.length - 1]

	function handleAddSet() {
		const w = Number.parseFloat(newWeight)
		const r = Number.parseInt(newReps, 10)
		if (Number.isNaN(w) || Number.isNaN(r)) return
		onAddSet({ exerciseId: exercise.id, weightKg: w, reps: r, setType: 'working' })
		setNewWeight(String(w))
		setNewReps(String(r))
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleAddSet()
		}
	}

	function handleWarmup() {
		const w = Number.parseFloat(newWeight)
		const r = Number.parseInt(newReps, 10)
		if (Number.isNaN(w) || w <= 0) return
		const warmups = generateWarmupSets(w, r || 5)
		for (const set of warmups) {
			onAddSet({ exerciseId: exercise.id, weightKg: set.weightKg, reps: set.reps, setType: 'warmup' })
		}
	}

	function handleBackoff() {
		if (!lastWorking) return
		const backoffs = generateBackoffSets(lastWorking.weightKg, lastWorking.reps)
		for (const set of backoffs) {
			onAddSet({ exerciseId: exercise.id, weightKg: set.weightKg, reps: set.reps, setType: 'backoff' })
		}
	}

	// Determine which planned sets are fulfilled by actual logs
	const fulfilledCount = plannedSets ? Math.min(workingSets.length, plannedSets.length) : 0
	const remainingPlanned = plannedSets?.slice(fulfilledCount) ?? []

	return (
		<div className="rounded-[--radius-sm] border border-edge bg-surface-1">
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
				<span className="font-medium text-ink text-sm">{exercise.name}</span>
				<span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
					{exercise.type}
				</span>
				<span className="ml-auto font-mono text-ink-muted text-xs tabular-nums">
					{logs.length}
					{plannedSets ? `/${plannedSets.length}` : ''} sets
					{vol > 0 && ` · ${(vol / 1000).toFixed(1)}k`}
				</span>
			</button>

			{!collapsed && (
				<div className="border-edge border-t px-3 py-2">
					{/* Logged sets */}
					<div className="space-y-0.5">
						{logs.map(log => (
							<SetRow key={log.id} log={log} onUpdate={onUpdateSet} onRemove={onRemoveSet} />
						))}
					</div>

					{/* Remaining planned sets (not yet confirmed) */}
					{!readOnly && remainingPlanned.length > 0 && (
						<div className="mt-1 space-y-0.5">
							{remainingPlanned.map((planned, _idx) => {
								const overrides = editableTargets.get(planned.setNumber)
								return (
									<PlannedSetRow
										key={planned.setNumber}
										setNumber={planned.setNumber}
										weightKg={overrides?.weight !== undefined ? overrides.weight : planned.weightKg}
										reps={overrides?.reps !== undefined ? overrides.reps : planned.reps}
										done={false}
										onConfirm={(weight, reps) => {
											onAddSet({
												exerciseId: exercise.id,
												weightKg: weight,
												reps,
												setType: 'working'
											})
											// Clear overrides for this set
											setEditableTargets(prev => {
												const next = new Map(prev)
												next.delete(planned.setNumber)
												return next
											})
										}}
										onWeightChange={w =>
											setEditableTargets(prev => {
												const next = new Map(prev)
												const existing = next.get(planned.setNumber)
												next.set(planned.setNumber, {
													weight: w,
													reps: existing?.reps ?? planned.reps
												})
												return next
											})
										}
										onRepsChange={r =>
											setEditableTargets(prev => {
												const next = new Map(prev)
												const existing = next.get(planned.setNumber)
												next.set(planned.setNumber, {
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

					{/* Add more sets */}
					{!readOnly && (
						<div className="mt-2 flex items-center gap-2">
							<NumberInput
								className="w-20"
								placeholder="kg"
								value={newWeight}
								onChange={e => setNewWeight(e.target.value)}
								onKeyDown={handleKeyDown}
								step={2.5}
								min={0}
							/>
							<span className="text-ink-faint text-xs">×</span>
							<NumberInput
								className="w-16"
								placeholder="reps"
								value={newReps}
								onChange={e => setNewReps(e.target.value)}
								onKeyDown={handleKeyDown}
								step={1}
								min={0}
							/>
							<Button size="sm" onClick={handleAddSet} disabled={!(newWeight && newReps)}>
								<Plus className="size-3.5" />
								Set
							</Button>
							<Button variant="outline" size="sm" onClick={handleWarmup} disabled={!newWeight}>
								<Zap className="size-3.5" />
								Warmup
							</Button>
							{lastWorking && (
								<Button variant="outline" size="sm" onClick={handleBackoff}>
									Backoff
								</Button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
