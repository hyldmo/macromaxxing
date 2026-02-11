import type { SetMode, SetType, TrainingGoal } from '@macromaxxing/db'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { NumberInput } from '~/components/ui/NumberInput'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { totalVolume } from '../utils/formulas'
import type { PlannedSet } from './ExerciseSetForm'
import { SetRow } from './SetRow'

type Log = RouterOutput['workout']['getSession']['logs'][number]
type Exercise = Log['exercise']

interface RoundSet {
	exerciseId: Exercise['id']
	exercise: Exercise
	planned: PlannedSet
	log: Log | null
	exerciseIndex: number
}

interface Round {
	setType: SetType
	sets: RoundSet[]
}

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
	onAddSet: (data: {
		exerciseId: Exercise['id']
		weightKg: number
		reps: number
		setType: SetType
		transition?: boolean
	}) => void
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

	const { rounds, extraLogs } = useMemo(() => {
		const exercisePhases = exercises.map((exData, exIdx) => {
			const { exercise, logs, plannedSets } = exData

			const warmupLogs = logs.filter(l => l.setType === 'warmup')
			const workingLogs = logs.filter(l => l.setType === 'working')
			const backoffLogs = logs.filter(l => l.setType === 'backoff')

			const plannedWarmups = plannedSets.filter(s => s.setType === 'warmup')
			const plannedWorking = plannedSets.filter(s => s.setType === 'working')
			const plannedBackoffs = plannedSets.filter(s => s.setType === 'backoff')

			const warmups: RoundSet[] = plannedWarmups.map((p, i) => ({
				exerciseId: exercise.id,
				exercise,
				planned: p,
				log: warmupLogs[i] ?? null,
				exerciseIndex: exIdx
			}))
			const working: RoundSet[] = plannedWorking.map((p, i) => ({
				exerciseId: exercise.id,
				exercise,
				planned: p,
				log: workingLogs[i] ?? null,
				exerciseIndex: exIdx
			}))
			const backoffs: RoundSet[] = plannedBackoffs.map((p, i) => ({
				exerciseId: exercise.id,
				exercise,
				planned: p,
				log: backoffLogs[i] ?? null,
				exerciseIndex: exIdx
			}))

			const extras: Log[] = [
				...warmupLogs.slice(plannedWarmups.length),
				...workingLogs.slice(plannedWorking.length),
				...backoffLogs.slice(plannedBackoffs.length)
			]

			return { warmups, working, backoffs, extras, exercise }
		})

		const rounds: Round[] = []

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

		const extraLogs = exercisePhases.flatMap(ep => ep.extras.map(log => ({ log, exercise: ep.exercise })))

		return { rounds, extraLogs }
	}, [exercises])

	return (
		<div className="rounded-sm border-2 border-edge border-l-accent bg-surface-1">
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
					{/* Exercise legend */}
					<div className="mb-2 flex gap-3">
						{exercises.map((exData, i) => (
							<span key={exData.exercise.id} className="flex items-center gap-1 text-[10px]">
								<span className="font-medium font-mono text-accent">{String.fromCharCode(65 + i)}</span>
								<span className="text-ink-muted">{exData.exercise.name}</span>
							</span>
						))}
					</div>

					{/* Interleaved rounds */}
					{rounds.map((round, roundIdx) => (
						<div key={`${round.setType}-${roundIdx}`}>
							{roundIdx > 0 && <div className="my-1.5 border-edge border-t" />}
							<div className="mb-0.5 font-mono text-[10px] text-ink-faint">
								Round {roundIdx + 1} — {round.setType}
							</div>
							<div className="space-y-0.5">
								{round.sets.map((entry, setIdx) => {
									const isLastInRound = setIdx === round.sets.length - 1

									if (entry.log) {
										return (
											<div key={entry.log.id} className="flex items-center gap-1.5">
												<ExerciseLabel index={entry.exerciseIndex} />
												<div className="min-w-0 flex-1">
													<SetRow
														weightKg={entry.log.weightKg}
														reps={entry.log.reps}
														setType={entry.log.setType}
														rpe={entry.log.rpe}
														failureFlag={entry.log.failureFlag}
														done
														onWeightChange={v => {
															if (v != null) onUpdateSet(entry.log!.id, { weightKg: v })
														}}
														onRepsChange={v => onUpdateSet(entry.log!.id, { reps: v })}
														onConfirm={() => onRemoveSet(entry.log!.id)}
													/>
												</div>
											</div>
										)
									}

									if (readOnly) return null

									const key = `${entry.exerciseId}-${entry.planned.setType}-${entry.planned.setNumber}`
									const overrides = editableTargets.get(key)
									const weightKg =
										overrides?.weight !== undefined ? overrides.weight : entry.planned.weightKg
									const reps = overrides?.reps !== undefined ? overrides.reps : entry.planned.reps

									return (
										<div key={key} className="flex items-center gap-1.5">
											<ExerciseLabel index={entry.exerciseIndex} />
											<div className="min-w-0 flex-1">
												<SetRow
													weightKg={weightKg}
													reps={reps}
													setType={entry.planned.setType}
													onConfirm={() => {
														onAddSet({
															exerciseId: entry.exerciseId,
															weightKg: weightKg ?? 0,
															reps,
															setType: entry.planned.setType,
															transition: !isLastInRound
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
																reps: existing?.reps ?? entry.planned.reps
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
																		: entry.planned.weightKg,
																reps: r
															})
															return next
														})
													}
												/>
											</div>
										</div>
									)
								})}
							</div>
						</div>
					))}

					{/* Extra logs beyond planned */}
					{extraLogs.length > 0 && (
						<>
							<div className="my-1.5 border-edge border-t" />
							<div className="mb-0.5 font-mono text-[10px] text-ink-faint">Extra sets</div>
							<div className="space-y-0.5">
								{extraLogs.map(({ log, exercise }) => (
									<div key={log.id} className="flex items-center gap-1.5">
										<span
											className="w-4 shrink-0 text-center font-medium font-mono text-[10px] text-accent"
											title={exercise.name}
										>
											{exercise.name.slice(0, 1)}
										</span>
										<div className="min-w-0 flex-1">
											<SetRow
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
										</div>
									</div>
								))}
							</div>
						</>
					)}

					{/* Freeform add set per exercise */}
					{!readOnly && (
						<>
							<div className="my-1.5 border-edge border-t" />
							<AddSetRow exercises={exercises} onAddSet={onAddSet} />
						</>
					)}
				</div>
			)}
		</div>
	)
}

const ExerciseLabel: FC<{ index: number }> = ({ index }) => (
	<span className="w-4 shrink-0 text-center font-medium font-mono text-[10px] text-accent">
		{String.fromCharCode(65 + index)}
	</span>
)

const AddSetRow: FC<{
	exercises: SupersetFormProps['exercises']
	onAddSet: SupersetFormProps['onAddSet']
}> = ({ exercises, onAddSet }) => {
	const [selectedIdx, setSelectedIdx] = useState(0)
	const [weight, setWeight] = useState('')
	const [reps, setReps] = useState('')

	const exercise = exercises[selectedIdx].exercise

	const handleAdd = () => {
		const w = Number.parseFloat(weight)
		const r = Number.parseInt(reps, 10)
		if (Number.isNaN(w) || Number.isNaN(r)) return
		onAddSet({ exerciseId: exercise.id, weightKg: w, reps: r, setType: 'working' })
		setWeight(String(w))
		setReps(String(r))
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleAdd()
		}
	}

	return (
		<div className="flex items-center gap-1.5">
			<div className="flex shrink-0">
				{exercises.map((_, i) => (
					<button
						key={exercises[i].exercise.id}
						type="button"
						className={cn(
							'px-3 py-1 font-medium font-mono transition-colors',
							i === 0 && 'rounded-l-sm',
							i === exercises.length - 1 && 'rounded-r-sm',
							selectedIdx === i
								? 'bg-accent text-white'
								: 'bg-surface-2 text-ink-faint hover:text-ink-muted'
						)}
						onClick={() => setSelectedIdx(i)}
					>
						{String.fromCharCode(65 + i)}
					</button>
				))}
			</div>
			<NumberInput
				className="w-20"
				placeholder="reps"
				value={reps}
				onChange={e => setReps(e.target.value)}
				onKeyDown={handleKeyDown}
				step={1}
				min={0}
			/>
			<span className="text-ink-faint text-xs">×</span>
			<NumberInput
				className="w-16"
				placeholder="kg"
				value={weight}
				onChange={e => setWeight(e.target.value)}
				onKeyDown={handleKeyDown}
				step={2.5}
				min={0}
			/>
			<Button size="icon" onClick={handleAdd} disabled={!(weight && reps)}>
				<Plus className="size-3.5" />
			</Button>
		</div>
	)
}
