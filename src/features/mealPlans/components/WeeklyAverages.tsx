import type { AbsoluteMacros, MacroTargets } from '@macromaxxing/db'
import type { FC } from 'react'
import { Card } from '~/components/ui'
import { KcalReadout } from '~/features/nutrition/components/KcalReadout'
import { MacroDelta } from '~/features/nutrition/components/MacroDelta'
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
import type { RouterOutput } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface WeeklyAveragesProps {
	inventory: InventoryItem[]
	/** Daily goals, or null when the user hasn't set one — averages then render bare. */
	targets: MacroTargets | null
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

	return (
		<Card className="p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-ink-muted text-sm">
					Weekly Average <span className="font-normal text-ink-faint">({filledDays} days)</span>
				</span>
				<div className="flex items-center gap-3 font-mono text-sm tabular-nums">
					<span className="font-bold">
						<KcalReadout kcal={weeklyAvg.kcal} target={targets?.kcal ?? null} /> kcal
					</span>
					<MacroDelta
						label="P"
						value={weeklyAvg.protein}
						target={targets?.protein}
						unit="g"
						className="text-macro-protein"
					/>
					<MacroDelta
						label="C"
						value={weeklyAvg.carbs}
						target={targets?.carbs}
						unit="g"
						className="text-macro-carbs"
					/>
					<MacroDelta
						label="F"
						value={weeklyAvg.fat}
						target={targets?.fat}
						unit="g"
						className="text-macro-fat"
					/>
				</div>
			</div>
		</Card>
	)
}
