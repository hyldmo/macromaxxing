import {
	type ExerciseType,
	exerciseType,
	fatigueTier as fatigueTierType,
	MUSCLE_GROUPS,
	type MuscleGroup,
	type Nullable,
	type TrainingGoal,
	trainingGoal as trainingGoalType
} from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { Check, Plus, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Input, NumberInput, Select, TRPCError } from '~/components/ui'
import { Label } from '~/components/ui/Label'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { getRepRange } from '~/lib/workouts'

type Exercise = RouterOutput['workout']['listExercises'][number]

export interface ExerciseFormProps {
	editExercise?: Exercise
	onClose: () => void
}

interface MuscleRow {
	muscleGroup: MuscleGroup
	intensity: string
}

export const ExerciseForm: FC<ExerciseFormProps> = ({ editExercise, onClose }) => {
	const [name, setName] = useState(editExercise?.name ?? '')
	const [type, setType] = useState<ExerciseType>(editExercise?.type ?? 'compound')
	const [fatigueTier, setFatigueTier] = useState(editExercise?.fatigueTier ?? 2)
	const [ranges, setRanges] = useState<Record<TrainingGoal, { min: Nullable<number>; max: Nullable<number> }>>({
		strength: { min: editExercise?.strengthRepsMin, max: editExercise?.strengthRepsMax },
		hypertrophy: { min: editExercise?.hypertrophyRepsMin, max: editExercise?.hypertrophyRepsMax }
	})
	const [muscles, setMuscles] = useState<MuscleRow[]>(
		editExercise?.muscles.map(m => ({ muscleGroup: m.muscleGroup, intensity: m.intensity.toString() })) ?? []
	)
	const utils = trpc.useUtils()

	const createMutation = trpc.workout.createExercise.useMutation({
		onSuccess: () => {
			utils.workout.listExercises.invalidate()
			onClose()
		}
	})

	const updateMutation = trpc.workout.updateExercise.useMutation({
		onSuccess: () => {
			utils.workout.listExercises.invalidate()
		}
	})

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		const muscleData = muscles
			.filter(m => m.intensity)
			.map(m => ({ muscleGroup: m.muscleGroup, intensity: Number.parseFloat(m.intensity) || 0 }))

		if (editExercise) {
			updateMutation.mutate({
				id: editExercise.id,
				name: name.trim(),
				type,
				fatigueTier,
				strengthRepsMin: ranges.strength.min ?? null,
				strengthRepsMax: ranges.strength.max ?? null,
				hypertrophyRepsMin: ranges.hypertrophy.min ?? null,
				hypertrophyRepsMax: ranges.hypertrophy.max ?? null,
				muscles: muscleData
			})
		} else {
			createMutation.mutate({
				name: name.trim(),
				type,
				fatigueTier,
				strengthRepsMin: ranges.strength.min ?? null,
				strengthRepsMax: ranges.strength.max ?? null,
				hypertrophyRepsMin: ranges.hypertrophy.min ?? null,
				hypertrophyRepsMax: ranges.hypertrophy.max ?? null,
				muscles: muscleData
			})
		}
	}

	function addMuscleRow() {
		const used = new Set(muscles.map(m => m.muscleGroup))
		const next = MUSCLE_GROUPS.find(mg => !used.has(mg))
		if (next) setMuscles([...muscles, { muscleGroup: next, intensity: '1' }])
	}

	function removeMuscleRow(index: number) {
		setMuscles(muscles.filter((_, i) => i !== index))
	}

	function updateMuscleRow(index: number, field: keyof MuscleRow, value: string) {
		setMuscles(muscles.map((m, i) => (i === index ? { ...m, [field]: value } : m)))
	}

	const isPending = createMutation.isPending || updateMutation.isPending
	const error = createMutation.error || updateMutation.error

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && <TRPCError error={error} />}

			<div className="grid gap-3 sm:grid-cols-3">
				<Label label="Exercise name">
					<Input placeholder="Exercise name" value={name} onChange={e => setName(e.target.value)} required />
				</Label>
				<Label label="Exercise type">
					<Select
						value={type}
						options={exerciseType.options.map(t => ({ label: startCase(t), value: t }))}
						onChange={setType}
					/>
				</Label>
				<Label label="Fatigue tier">
					<Select
						value={fatigueTier}
						options={Array.from(fatigueTierType.values).map(t => ({ label: `Tier ${t}`, value: t }))}
						onChange={setFatigueTier}
					/>
				</Label>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{trainingGoalType.options
					.map(v => [v, ['min', 'max']] as const)
					.map(([goal, range]) =>
						range.map(cap => (
							<Label key={goal + cap} label={`${startCase(goal)} ${startCase(cap)}`}>
								<NumberInput
									value={ranges[goal][cap] ?? ''}
									onChange={e => {
										const v = Number.parseInt(e.target.value, 10)
										setRanges(ranges => ({
											...ranges,
											[goal]: { ...ranges[goal], [cap]: Number.isNaN(v) ? null : v }
										}))
									}}
									placeholder={getRepRange(editExercise!, goal)[cap].toString()}
									min={1}
									step={1}
								/>
							</Label>
						))
					)}
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-ink-muted text-xs">Muscles</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 gap-1 px-2 text-xs"
						onClick={addMuscleRow}
						disabled={muscles.length >= MUSCLE_GROUPS.length}
					>
						<Plus className="size-3" />
						Add
					</Button>
				</div>
				{muscles.map((m, i) => (
					<div key={m.muscleGroup} className="flex items-center gap-2">
						<Select
							value={m.muscleGroup}
							options={MUSCLE_GROUPS.map(mg => mg)}
							onChange={v => updateMuscleRow(i, 'muscleGroup', v)}
							className="flex-1"
						/>
						<NumberInput
							value={m.intensity}
							onChange={e => updateMuscleRow(i, 'intensity', e.target.value)}
							min={0}
							step={0.1}
							className="w-20"
							placeholder="0-1"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => removeMuscleRow(i)}
						>
							<Trash2 className="size-3.5 text-ink-faint" />
						</Button>
					</div>
				))}
				{muscles.length === 0 && (
					<p className="text-ink-faint text-xs italic">No muscles defined. Add muscles above.</p>
				)}
			</div>

			<div className="flex items-center justify-end gap-2 pt-2">
				{updateMutation.isSuccess && (
					<span className="flex items-center gap-1 text-sm text-success">
						<Check className="size-4" /> Saved
					</span>
				)}
				<Button type="button" variant="outline" onClick={onClose}>
					{editExercise ? 'Done' : 'Cancel'}
				</Button>
				<Button type="submit" disabled={!name.trim() || isPending}>
					{editExercise ? 'Update' : 'Create'}
				</Button>
			</div>
		</form>
	)
}
