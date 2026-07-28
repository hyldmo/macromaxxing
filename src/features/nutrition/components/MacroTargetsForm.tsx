import {
	ACTIVITY_MULTIPLIER,
	type ActivityLevel,
	activityLevel,
	deriveProfileTargets,
	type MacroTargets,
	type NutritionGoal,
	nutritionGoal
} from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { type FC, useEffect, useMemo, useState } from 'react'
import { ButtonGroup, NumberInput, SaveButton, Select, TRPCError } from '~/components/ui'
import { trpc } from '~/lib/trpc'

const ACTIVITY_OPTIONS = activityLevel.options.map(value => ({
	value,
	label: `${startCase(value)} (${ACTIVITY_MULTIPLIER[value]})`
}))

const GOAL_OPTIONS = nutritionGoal.options.map(value => ({ value, label: startCase(value) }))

const MACRO_FIELDS = [
	{ key: 'kcal', label: 'Calories', unit: 'kcal', color: 'text-macro-kcal', step: 50 },
	{ key: 'protein', label: 'Protein', unit: 'g', color: 'text-macro-protein', step: 5 },
	{ key: 'carbs', label: 'Carbs', unit: 'g', color: 'text-macro-carbs', step: 5 },
	{ key: 'fat', label: 'Fat', unit: 'g', color: 'text-macro-fat', step: 5 },
	{ key: 'fiber', label: 'Fiber', unit: 'g', color: 'text-macro-fiber', step: 1 }
] as const satisfies ReadonlyArray<{
	key: keyof MacroTargets
	label: string
	unit: string
	color: string
	step: number
}>

/** Form state mirrors MacroTargets, held as strings so a half-typed field survives a render. */
type TargetFields = Record<keyof MacroTargets, string>

const EMPTY_FIELDS: TargetFields = { kcal: '', protein: '', carbs: '', fat: '', fiber: '' }

const toFields = (targets: MacroTargets | null | undefined): TargetFields =>
	targets
		? {
				kcal: String(targets.kcal),
				protein: String(targets.protein),
				carbs: String(targets.carbs),
				fat: String(targets.fat),
				fiber: String(targets.fiber)
			}
		: EMPTY_FIELDS

const parse = (value: string) => (value ? Number.parseFloat(value) : null)

/**
 * Goal + activity drive derived targets (cut/maintain/bulk read the body profile through
 * `deriveProfileTargets`, the same helper the server resolves with). Only `custom` writes the
 * `target_*` columns — switching to it keeps whatever was last derived, so it's an edit, not a reset.
 */
export const MacroTargetsForm: FC = () => {
	const targetsQuery = trpc.settings.getTargets.useQuery()
	const utils = trpc.useUtils()
	const saveMutation = trpc.settings.saveTargets.useMutation({
		onSuccess: () => {
			utils.settings.getTargets.invalidate()
			utils.dashboard.summary.invalidate()
		}
	})

	const [goal, setGoal] = useState<NutritionGoal>('maintain')
	const [activity, setActivity] = useState<ActivityLevel>('moderate')
	// Only `custom` owns editable numbers. Derived goals compute theirs during render below —
	// mirroring them into state would race this effect: on the render where `saved` first
	// arrives, `goal` is still the initial 'maintain', so a saved `custom` row would briefly
	// produce a maintain-shaped preview and overwrite the user's stored targets with it.
	const [customFields, setCustomFields] = useState<TargetFields>(EMPTY_FIELDS)

	const saved = targetsQuery.data

	useEffect(() => {
		if (!saved) return
		setGoal(saved.nutritionGoal ?? 'maintain')
		setActivity(saved.activityLevel ?? 'moderate')
		setCustomFields(toFields(saved.targets))
	}, [saved])

	const derived = useMemo(
		() => (saved && goal !== 'custom' ? deriveProfileTargets({ ...saved, activityLevel: activity }, goal) : null),
		[saved, goal, activity]
	)

	const isCustom = goal === 'custom'
	const fields = isCustom ? customFields : toFields(derived)

	// Switching to Custom hands off whatever was on screen, so it reads as an edit, not a reset.
	function handleGoalChange(next: NutritionGoal) {
		if (next === 'custom' && derived) setCustomFields(toFields(derived))
		setGoal(next)
	}

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({
			nutritionGoal: goal,
			activityLevel: activity,
			// Derived goals recompute from the body profile on read, so their numbers aren't persisted.
			targetKcal: isCustom ? parse(fields.kcal) : null,
			targetProtein: isCustom ? parse(fields.protein) : null,
			targetCarbs: isCustom ? parse(fields.carbs) : null,
			targetFat: isCustom ? parse(fields.fat) : null,
			targetFiber: isCustom ? parse(fields.fiber) : null
		})
	}

	const savedFields = toFields(saved?.targets)
	// A null saved goal means "no targets yet", so the pre-filled defaults count as a change —
	// otherwise a first-time user could never save the goal the form is already showing.
	const hasChanges =
		saved &&
		(saved.nutritionGoal !== goal ||
			(saved.activityLevel ?? 'moderate') !== activity ||
			(isCustom && MACRO_FIELDS.some(f => savedFields[f.key] !== fields[f.key])))

	const missingProfile = !(isCustom || (saved?.weightKg && saved.heightCm && saved.age))

	if (targetsQuery.error) return <TRPCError error={targetsQuery.error} />

	return (
		<form onSubmit={handleSave} className="space-y-3">
			<div className="flex flex-wrap items-end gap-3">
				<div className="space-y-1">
					<span className="block text-ink-muted text-sm">Goal</span>
					<ButtonGroup options={GOAL_OPTIONS} value={goal} onChange={handleGoalChange} />
				</div>
				{!isCustom && (
					<div className="space-y-1">
						<label className="block text-ink-muted text-sm" htmlFor="activity">
							Activity
						</label>
						<Select id="activity" value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} />
					</div>
				)}
				{saved?.tdee != null && !isCustom && (
					<p className="font-mono text-ink-muted text-sm tabular-nums">
						TDEE <span className="font-semibold text-ink">{Math.round(saved.tdee)}</span> kcal
					</p>
				)}
			</div>

			{missingProfile && (
				<p className="text-ink-faint text-xs">
					Fill in height, weight and age under Body Profile to derive targets — or pick Custom to enter them
					by hand.
				</p>
			)}

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
				{MACRO_FIELDS.map(field => (
					<div key={field.key} className="space-y-1">
						<label className={`${field.color} text-xs`} htmlFor={`target-${field.key}`}>
							{field.label}
						</label>
						<NumberInput
							id={`target-${field.key}`}
							value={fields[field.key]}
							onChange={e => setCustomFields(prev => ({ ...prev, [field.key]: e.target.value }))}
							min={0}
							step={field.step}
							unit={field.unit}
							disabled={!isCustom}
						/>
					</div>
				))}
			</div>

			<SaveButton mutation={saveMutation} disabled={!hasChanges} />
		</form>
	)
}
