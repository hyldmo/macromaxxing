import type { FC } from 'react'
import { Card } from '~/components/ui'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	calculateWeeklyAverage,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { cn } from '~/lib/cn'
import type { AbsoluteMacros, MacroTargets } from '~/lib/macros'
import type { RouterOutput } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface WeeklyAveragesProps {
	inventory: InventoryItem[]
	targets?: MacroTargets | null
}

function delta(actual: number, target: number): string {
	const diff = actual - target
	if (Math.abs(diff) < 1) return ''
	return diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0)
}

export const WeeklyAverages: FC<WeeklyAveragesProps> = ({ inventory, targets }) => {
	// Calculate day totals for each day (0-6)
	const dayTotals: AbsoluteMacros[] = []

	for (let day = 0; day < 7; day++) {
		const slotsForDay = inventory.flatMap(inv =>
			inv.slots
				.filter(s => s.dayOfWeek === day)
				.map(slot => {
					const recipe = inv.recipe
					const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
					const totals = calculateRecipeTotals(items)
					const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
					const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
					return calculateSlotMacros(portionMacros, slot.portions)
				})
		)
		dayTotals.push(calculateDayTotals(slotsForDay))
	}

	const weeklyAvg = calculateWeeklyAverage(dayTotals)
	const filledDays = dayTotals.filter(d => d.kcal > 0).length

	if (filledDays === 0) {
		return null
	}

	const hasTargets = targets != null && targets.kcal > 0

	return (
		<Card className="p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-ink-muted text-sm">
					Weekly Average <span className="font-normal text-ink-faint">({filledDays} days)</span>
				</span>
				<div className="flex items-center gap-3 font-mono text-sm tabular-nums">
					<span className="font-bold text-macro-kcal">
						{weeklyAvg.kcal.toFixed(0)}
						{hasTargets && <span className="font-normal text-ink-faint">/{targets.kcal}</span>}
						{' kcal'}
					</span>
					<MacroValue
						label="P"
						value={weeklyAvg.protein}
						target={hasTargets ? targets.protein : null}
						color="text-macro-protein"
					/>
					<MacroValue
						label="C"
						value={weeklyAvg.carbs}
						target={hasTargets ? targets.carbs : null}
						color="text-macro-carbs"
					/>
					<MacroValue
						label="F"
						value={weeklyAvg.fat}
						target={hasTargets ? targets.fat : null}
						color="text-macro-fat"
					/>
				</div>
			</div>
			{hasTargets && (
				<div className="mt-2 flex gap-1">
					<TargetProgressBar
						label="Kcal"
						value={weeklyAvg.kcal}
						target={targets.kcal}
						color="bg-macro-kcal"
					/>
					<TargetProgressBar
						label="P"
						value={weeklyAvg.protein}
						target={targets.protein}
						color="bg-macro-protein"
					/>
					<TargetProgressBar
						label="C"
						value={weeklyAvg.carbs}
						target={targets.carbs}
						color="bg-macro-carbs"
					/>
					<TargetProgressBar label="F" value={weeklyAvg.fat} target={targets.fat} color="bg-macro-fat" />
				</div>
			)}
		</Card>
	)
}

interface MacroValueProps {
	label: string
	value: number
	target: number | null
	color: string
}

const MacroValue: FC<MacroValueProps> = ({ label, value, target, color }) => (
	<span className={color}>
		{label} {value.toFixed(0)}g
		{target != null && target > 0 && (
			<span
				className={cn(
					'ml-0.5 text-xs',
					Math.abs(value - target) < target * 0.05
						? 'text-ink-faint'
						: value > target
							? 'text-destructive'
							: 'text-ink-faint'
				)}
			>
				{delta(value, target)}
			</span>
		)}
	</span>
)

interface TargetProgressBarProps {
	label: string
	value: number
	target: number
	color: string
}

const TargetProgressBar: FC<TargetProgressBarProps> = ({ label, value, target, color }) => {
	const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
	return (
		<div className="flex-1">
			<div className="mb-0.5 text-center font-mono text-[9px] text-ink-faint">{label}</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
				<div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
			</div>
		</div>
	)
}
