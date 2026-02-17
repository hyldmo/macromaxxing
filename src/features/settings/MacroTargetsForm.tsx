import type { MacroTargets, NutritionGoal } from '@macromaxxing/db'
import { type FC, useEffect, useMemo, useState } from 'react'
import { NumberInput, SaveButton, Select } from '~/components/ui'
import { deriveMacroTargets, estimateBMR, estimateTDEE } from '~/features/workouts/utils/formulas'
import { trpc } from '~/lib/trpc'

const ACTIVITY_LEVELS = [
	{ label: 'Sedentary (1.2)', value: '1.2' },
	{ label: 'Light (1.375)', value: '1.375' },
	{ label: 'Moderate (1.55)', value: '1.55' },
	{ label: 'Active (1.725)', value: '1.725' },
	{ label: 'Very Active (1.9)', value: '1.9' }
]

const GOAL_OPTIONS = [
	{ label: 'Cut (-500 kcal)', value: 'cut' },
	{ label: 'Maintain', value: 'maintain' },
	{ label: 'Bulk (+300 kcal)', value: 'bulk' },
	{ label: 'Custom', value: 'custom' }
]

export const MacroTargetsForm: FC = () => {
	const targetsQuery = trpc.settings.getTargets.useQuery()
	const utils = trpc.useUtils()
	const saveMutation = trpc.settings.saveTargets.useMutation({
		onSuccess: () => {
			utils.settings.getTargets.invalidate()
		}
	})

	const [age, setAge] = useState('')
	const [activityLevel, setActivityLevel] = useState('1.55')
	const [goal, setGoal] = useState<NutritionGoal>('maintain')
	const [targetKcal, setTargetKcal] = useState('')
	const [targetProtein, setTargetProtein] = useState('')
	const [targetCarbs, setTargetCarbs] = useState('')
	const [targetFat, setTargetFat] = useState('')
	const [targetFiber, setTargetFiber] = useState('')

	useEffect(() => {
		if (targetsQuery.data) {
			const d = targetsQuery.data
			setAge(d.age?.toString() ?? '')
			setActivityLevel(d.activityLevel?.toString() ?? '1.55')
			setGoal(d.nutritionGoal ?? 'maintain')
			setTargetKcal(d.targetKcal?.toString() ?? '')
			setTargetProtein(d.targetProtein?.toString() ?? '')
			setTargetCarbs(d.targetCarbs?.toString() ?? '')
			setTargetFat(d.targetFat?.toString() ?? '')
			setTargetFiber(d.targetFiber?.toString() ?? '')
		}
	}, [targetsQuery.data])

	// Compute TDEE when we have all required body stats
	const tdee = useMemo(() => {
		const data = targetsQuery.data
		if (!(data?.weightKg && data?.heightCm)) return null
		const ageNum = age ? Number.parseInt(age, 10) : null
		if (!ageNum) return null
		const bmr = estimateBMR(data.weightKg, data.heightCm, ageNum, data.sex)
		return estimateTDEE(bmr, Number.parseFloat(activityLevel))
	}, [targetsQuery.data, age, activityLevel])

	// When goal is not custom and TDEE is available, derive targets
	const derivedTargets: MacroTargets | null = useMemo(() => {
		if (goal === 'custom' || !tdee || !targetsQuery.data?.weightKg) return null
		return deriveMacroTargets(tdee, targetsQuery.data.weightKg, goal)
	}, [goal, tdee, targetsQuery.data?.weightKg])

	// Apply derived targets when they change
	useEffect(() => {
		if (derivedTargets) {
			setTargetKcal(derivedTargets.kcal.toString())
			setTargetProtein(derivedTargets.protein.toString())
			setTargetCarbs(derivedTargets.carbs.toString())
			setTargetFat(derivedTargets.fat.toString())
			setTargetFiber(derivedTargets.fiber.toString())
		}
	}, [derivedTargets])

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({
			age: age ? Number.parseInt(age, 10) : null,
			activityLevel: Number.parseFloat(activityLevel) || null,
			nutritionGoal: goal,
			targetKcal: targetKcal ? Number.parseFloat(targetKcal) : null,
			targetProtein: targetProtein ? Number.parseFloat(targetProtein) : null,
			targetCarbs: targetCarbs ? Number.parseFloat(targetCarbs) : null,
			targetFat: targetFat ? Number.parseFloat(targetFat) : null,
			targetFiber: targetFiber ? Number.parseFloat(targetFiber) : null
		})
	}

	const isCustom = goal === 'custom'
	const canDerive = tdee != null && !isCustom
	const hasMissingProfile = !(targetsQuery.data?.weightKg && targetsQuery.data?.heightCm)

	const hasChanges =
		targetsQuery.data &&
		(String(targetsQuery.data.age ?? '') !== age ||
			String(targetsQuery.data.activityLevel ?? '1.55') !== activityLevel ||
			(targetsQuery.data.nutritionGoal ?? 'maintain') !== goal ||
			String(targetsQuery.data.targetKcal ?? '') !== targetKcal ||
			String(targetsQuery.data.targetProtein ?? '') !== targetProtein ||
			String(targetsQuery.data.targetCarbs ?? '') !== targetCarbs ||
			String(targetsQuery.data.targetFat ?? '') !== targetFat ||
			String(targetsQuery.data.targetFiber ?? '') !== targetFiber)

	return (
		<form onSubmit={handleSave} className="space-y-3">
			{/* TDEE inputs */}
			<div className="grid grid-cols-3 gap-3">
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="age">
						Age
					</label>
					<NumberInput
						id="age"
						value={age}
						onChange={e => setAge(e.target.value)}
						placeholder="25"
						min={10}
						step={1}
					/>
				</div>
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="activity">
						Activity Level
					</label>
					<Select
						id="activity"
						value={activityLevel}
						options={ACTIVITY_LEVELS}
						onChange={v => setActivityLevel(v)}
					/>
				</div>
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="goal">
						Goal
					</label>
					<Select id="goal" value={goal} options={GOAL_OPTIONS} onChange={v => setGoal(v as NutritionGoal)} />
				</div>
			</div>

			{tdee != null && (
				<p className="font-mono text-ink-muted text-sm tabular-nums">
					TDEE: <span className="font-semibold text-ink">{Math.round(tdee)} kcal</span>
				</p>
			)}

			{hasMissingProfile && !isCustom && (
				<p className="text-ink-faint text-xs">
					Set your height and weight in Body Profile above to auto-calculate targets.
				</p>
			)}

			{/* Macro targets */}
			<fieldset className="space-y-2">
				<legend className="mb-1 text-ink-muted text-sm">
					Daily Targets{canDerive ? ' (auto-calculated)' : ''}
				</legend>
				<div className="grid grid-cols-5 gap-2">
					<div className="space-y-1">
						<label className="text-macro-kcal text-xs" htmlFor="target-kcal">
							Calories
						</label>
						<NumberInput
							id="target-kcal"
							value={targetKcal}
							onChange={e => setTargetKcal(e.target.value)}
							placeholder="2000"
							min={0}
							step={50}
							unit="kcal"
							readOnly={canDerive}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-macro-protein text-xs" htmlFor="target-protein">
							Protein
						</label>
						<NumberInput
							id="target-protein"
							value={targetProtein}
							onChange={e => setTargetProtein(e.target.value)}
							placeholder="150"
							min={0}
							step={5}
							unit="g"
							readOnly={canDerive}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-macro-carbs text-xs" htmlFor="target-carbs">
							Carbs
						</label>
						<NumberInput
							id="target-carbs"
							value={targetCarbs}
							onChange={e => setTargetCarbs(e.target.value)}
							placeholder="200"
							min={0}
							step={5}
							unit="g"
							readOnly={canDerive}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-macro-fat text-xs" htmlFor="target-fat">
							Fat
						</label>
						<NumberInput
							id="target-fat"
							value={targetFat}
							onChange={e => setTargetFat(e.target.value)}
							placeholder="65"
							min={0}
							step={5}
							unit="g"
							readOnly={canDerive}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-macro-fiber text-xs" htmlFor="target-fiber">
							Fiber
						</label>
						<NumberInput
							id="target-fiber"
							value={targetFiber}
							onChange={e => setTargetFiber(e.target.value)}
							placeholder="28"
							min={0}
							step={1}
							unit="g"
							readOnly={canDerive}
						/>
					</div>
				</div>
			</fieldset>

			<SaveButton mutation={saveMutation} disabled={!hasChanges} />
		</form>
	)
}
