import type { SetMode, SetType } from '@macromaxxing/db'
import { ArrowLeftRight, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, NumberInput } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'
import { totalVolume } from '../utils/formulas'
import { WorkoutModes } from '../WorkoutMode'
import { SetRow } from './SetRow'

type Log = RouterOutput['workout']['getSession']['logs'][number]
type Exercise = Log['exercise']

export interface PlannedSet {
	setNumber: number
	weightKg: number | null
	reps: number
	setType: SetType
}

export interface ExerciseSetFormProps {
	exercise: Exercise
	logs: Log[]
	plannedSets?: PlannedSet[]
	setMode?: SetMode
	onSetModeChange?: (mode: SetMode) => void
	onAddSet: (data: { exerciseId: Exercise['id']; weightKg: number; reps: number; setType: SetType }) => void
	onUpdateSet: (id: Log['id'], updates: { weightKg?: number; reps?: number; rpe?: number | null }) => void
	onRemoveSet: (id: Log['id']) => void
	onReplace?: (exerciseId: Exercise['id']) => void
	readOnly?: boolean
	active?: boolean
}

export const ExerciseSetForm: FC<ExerciseSetFormProps> = ({
	exercise,
	logs,
	plannedSets,
	setMode,
	onSetModeChange,
	onAddSet,
	onUpdateSet,
	onRemoveSet,
	onReplace,
	readOnly,
	active
}) => {
	const [collapsed, setCollapsed] = useState(false)
	const [newWeight, setNewWeight] = useState('')
	const [newReps, setNewReps] = useState('')
	const [editableTargets, setEditableTargets] = useState<Map<number, { weight: number | null; reps: number }>>(
		new Map()
	)

	const vol = totalVolume(logs.filter(l => l.setType !== 'warmup'))

	// Track fulfillment per set type
	const warmupLogs = logs.filter(l => l.setType === 'warmup')
	const workingLogs = logs.filter(l => l.setType === 'working')
	const backoffLogs = logs.filter(l => l.setType === 'backoff')

	const plannedWarmups = plannedSets?.filter(s => s.setType === 'warmup') ?? []
	const plannedWorking = plannedSets?.filter(s => s.setType === 'working') ?? []
	const plannedBackoffs = plannedSets?.filter(s => s.setType === 'backoff') ?? []

	const remainingWarmups = plannedWarmups.slice(warmupLogs.length)
	const remainingWorking = plannedWorking.slice(workingLogs.length)
	const remainingBackoffs = plannedBackoffs.slice(backoffLogs.length)
	const remainingPlanned = [...remainingWarmups, ...remainingWorking, ...remainingBackoffs]

	const totalPlanned = plannedSets?.length ?? 0

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

	return (
		<div className="rounded-sm border border-edge bg-surface-1" data-exercise-id={exercise.id}>
			<div className="flex items-center gap-2 px-3 py-2">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-2 text-left"
					onClick={() => setCollapsed(!collapsed)}
				>
					{collapsed ? (
						<ChevronRight className="size-4 shrink-0 text-ink-faint" />
					) : (
						<ChevronDown className="size-4 shrink-0 text-ink-faint" />
					)}
					<span className="font-medium text-ink text-sm">{exercise.name}</span>
					<span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
						{exercise.type}
					</span>
					<span className="ml-auto font-mono text-ink-muted text-xs tabular-nums">
						{logs.length}
						{totalPlanned > 0 ? `/${totalPlanned}` : ''} sets
						{vol > 0 && ` · ${(vol / 1000).toFixed(1)}k`}
					</span>
				</button>
				{onReplace && !readOnly && (
					<button
						type="button"
						className="shrink-0 rounded-sm p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-accent"
						onClick={() => onReplace(exercise.id)}
					>
						<ArrowLeftRight className="size-3.5" />
					</button>
				)}
			</div>

			{!collapsed && (
				<div className="border-edge border-t px-3 py-2">
					{/* Mode toggle (session-level override) */}
					{!readOnly && setMode && onSetModeChange && (
						<div className="mb-2 flex items-center gap-2">
							<span className="text-[10px] text-ink-faint">Mode</span>
							<WorkoutModes value={setMode} onChange={onSetModeChange} />
						</div>
					)}

					{/* Logged sets */}
					<div className="space-y-0.5">
						{logs.map(log => (
							<SetRow
								key={log.id}
								weightKg={log.weightKg}
								reps={log.reps}
								setType={log.setType}
								rpe={log.rpe}
								failureFlag={log.failureFlag}
								done
								onWeightChange={v => {
									if (v != null) onUpdateSet(log.id, { weightKg: v })
								}}
								onRepsChange={v => onUpdateSet(log.id, { reps: v })}
								onConfirm={() => onRemoveSet(log.id)}
							/>
						))}
					</div>

					{/* Remaining planned sets (not yet confirmed) */}
					{!readOnly && remainingPlanned.length > 0 && (
						<div className="mt-1 space-y-0.5">
							{remainingPlanned.map((planned, idx) => {
								const overrides = editableTargets.get(planned.setNumber)
								const weight = overrides?.weight !== undefined ? overrides.weight : planned.weightKg
								const reps = overrides?.reps !== undefined ? overrides.reps : planned.reps
								return (
									<SetRow
										key={`${planned.setType}-${planned.setNumber}`}
										weightKg={weight}
										reps={reps}
										setType={planned.setType}
										active={active && idx === 0}
										onConfirm={() => {
											onAddSet({
												exerciseId: exercise.id,
												weightKg: weight ?? 0,
												reps,
												setType: planned.setType
											})
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
								className="w-24"
								placeholder="reps"
								value={newReps}
								onChange={e => setNewReps(e.target.value)}
								onKeyDown={handleKeyDown}
								step={1}
								min={0}
							/>
							<span className="text-ink-faint text-xs">×</span>
							<NumberInput
								className="w-24"
								placeholder="kg"
								value={newWeight}
								onChange={e => setNewWeight(e.target.value)}
								onKeyDown={handleKeyDown}
								step={2.5}
								min={0}
							/>
							<Button size="sm" onClick={handleAddSet} disabled={!(newWeight && newReps)}>
								<Plus className="size-3.5" />
								Set
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
