import type { FC } from 'react'
import { Card } from '~/components/ui/Card'
import {
	type AbsoluteMacros,
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	calculateWeeklyAverage,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from '~/features/recipes/utils/macros'
import type { RouterOutput } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface WeeklyAveragesProps {
	inventory: InventoryItem[]
}

export const WeeklyAverages: FC<WeeklyAveragesProps> = ({ inventory }) => {
	// Calculate day totals for each day (0-6)
	const dayTotals: AbsoluteMacros[] = []

	for (let day = 0; day < 7; day++) {
		const slotsForDay = inventory.flatMap(inv =>
			inv.slots
				.filter(s => s.dayOfWeek === day)
				.map(slot => {
					const recipe = inv.recipe
					const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
						per100g: ri.ingredient,
						amountGrams: ri.amountGrams
					}))
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
					<span className="font-bold text-macro-kcal">{weeklyAvg.kcal.toFixed(0)} kcal</span>
					<span className="text-macro-protein">P {weeklyAvg.protein.toFixed(0)}g</span>
					<span className="text-macro-carbs">C {weeklyAvg.carbs.toFixed(0)}g</span>
					<span className="text-macro-fat">F {weeklyAvg.fat.toFixed(0)}g</span>
				</div>
			</div>
		</Card>
	)
}
