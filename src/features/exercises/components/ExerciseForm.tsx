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
import { type FC, useEffect, useState } from 'react'
import { Button, Input, NumberInput, Select, Textarea, TRPCError } from '~/components/ui'
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
	const trimmedName = name.trim()

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

			{editExercise?.userId && <GuideEditor exercise={editExercise} />}

			<div className="flex items-center justify-end gap-2 pt-2">
				{updateMutation.isSuccess && (
					<span className="flex items-center gap-1 text-sm text-success">
						<Check className="size-4" /> Saved
					</span>
				)}
				<Button type="button" variant="outline" onClick={onClose}>
					{editExercise ? 'Done' : 'Cancel'}
				</Button>
				<Button type="submit" disabled={!trimmedName || isPending}>
					{editExercise ? 'Update' : 'Create'}
				</Button>
			</div>
		</form>
	)
}

interface GuideEditorProps {
	exercise: Exercise
}

const GuideEditor: FC<GuideEditorProps> = ({ exercise }) => {
	const utils = trpc.useUtils()
	const guideQuery = trpc.workout.getGuide.useQuery({ exerciseId: exercise.id })

	const [description, setDescription] = useState('')
	const [cues, setCues] = useState<string[]>([''])
	const [pitfalls, setPitfalls] = useState<string[]>([])
	const [hydrated, setHydrated] = useState(false)

	useEffect(() => {
		if (!guideQuery.data || hydrated) return
		setDescription(guideQuery.data.description)
		setCues(guideQuery.data.cues.length > 0 ? guideQuery.data.cues : [''])
		setPitfalls(guideQuery.data.pitfalls ?? [])
		setHydrated(true)
	}, [guideQuery.data, hydrated])

	const upsertMutation = trpc.workout.upsertGuide.useMutation({
		onSuccess: () => utils.workout.getGuide.invalidate({ exerciseId: exercise.id })
	})
	const deleteMutation = trpc.workout.deleteGuide.useMutation({
		onSuccess: () => utils.workout.getGuide.invalidate({ exerciseId: exercise.id })
	})

	function handleSave() {
		const trimmedCues = cues.map(c => c.trim()).filter(Boolean)
		const trimmedPitfalls = pitfalls.map(p => p.trim()).filter(Boolean)
		upsertMutation.mutate({
			exerciseId: exercise.id,
			description: description.trim(),
			cues: trimmedCues,
			pitfalls: trimmedPitfalls.length > 0 ? trimmedPitfalls : null
		})
	}

	const canSave =
		description.trim().length >= 10 &&
		cues.filter(c => c.trim().length >= 3).length >= 1 &&
		!upsertMutation.isPending

	return (
		<section className="space-y-3 rounded-md border border-edge border-dashed bg-surface-1 p-3">
			<div className="flex items-center justify-between">
				<span className="font-medium text-ink text-xs uppercase tracking-wide">Exercise guide</span>
				{guideQuery.data && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-destructive text-xs hover:text-destructive"
						onClick={() => deleteMutation.mutate({ exerciseId: exercise.id })}
						disabled={deleteMutation.isPending}
					>
						<Trash2 className="size-3" />
						Remove guide
					</Button>
				)}
			</div>

			{upsertMutation.error && <TRPCError error={upsertMutation.error} />}
			{deleteMutation.error && <TRPCError error={deleteMutation.error} />}

			<Label label="Description">
				<Textarea
					value={description}
					onChange={e => setDescription(e.target.value)}
					placeholder="One sentence about what this movement trains."
					rows={2}
					maxLength={500}
				/>
			</Label>

			<RepeatableList
				label="Form cues"
				placeholder="e.g. Pin elbows to torso through full range."
				items={cues}
				onChange={setCues}
				min={1}
			/>

			<RepeatableList
				label="Common pitfalls (optional)"
				placeholder="e.g. Letting the lower back round at the bottom."
				items={pitfalls}
				onChange={setPitfalls}
				min={0}
			/>

			<div className="flex items-center justify-end gap-2">
				{upsertMutation.isSuccess && (
					<span className="flex items-center gap-1 text-sm text-success">
						<Check className="size-4" /> Saved
					</span>
				)}
				<Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
					{guideQuery.data ? 'Update guide' : 'Save guide'}
				</Button>
			</div>
		</section>
	)
}

interface RepeatableListProps {
	label: string
	placeholder: string
	items: string[]
	onChange: (items: string[]) => void
	min: number
}

const RepeatableList: FC<RepeatableListProps> = ({ label, placeholder, items, onChange, min }) => {
	const effective = items.length === 0 ? [''] : items

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-ink-muted text-xs">{label}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-2 text-xs"
					onClick={() => onChange([...items, ''])}
					disabled={items.length >= 10}
				>
					<Plus className="size-3" />
					Add
				</Button>
			</div>
			{effective.map((item, i) => (
				<div key={`${i}-${item.slice(0, 8)}`} className="flex items-start gap-2">
					<span className="mt-2 font-mono text-ink-faint text-xs tabular-nums">{i + 1}.</span>
					<Textarea
						value={item}
						onChange={e => onChange(effective.map((it, idx) => (idx === i ? e.target.value : it)))}
						placeholder={placeholder}
						rows={2}
						maxLength={300}
						className="flex-1"
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="mt-1 size-7"
						onClick={() => onChange(effective.filter((_, idx) => idx !== i))}
						disabled={effective.length <= min}
					>
						<Trash2 className="size-3.5 text-ink-faint" />
					</Button>
				</div>
			))}
		</div>
	)
}
