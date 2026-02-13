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
import type { AbsoluteMacros } from '~/lib/macros'
import type { RouterOutput } from '~/lib/trpc'

type MealPlan = RouterOutput['mealPlan']['get']
type InventoryItem = MealPlan['inventory'][number]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

function fmt(m: AbsoluteMacros): string {
	return `${m.kcal.toFixed(0)} kcal | P ${m.protein.toFixed(0)}g | C ${m.carbs.toFixed(0)}g | F ${m.fat.toFixed(0)}g | Fiber ${m.fiber.toFixed(0)}g`
}

function getPortionMacros(inv: InventoryItem): AbsoluteMacros {
	const items: IngredientWithAmount[] = inv.recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, inv.recipe.cookedWeight)
	return calculatePortionMacros(totals, cookedWeight, inv.recipe.portionSize)
}

/** Format a meal plan as LLM-friendly markdown */
export function formatMealPlan(plan: MealPlan): string {
	const lines: string[] = []

	// Calculate day totals
	const dayTotals: AbsoluteMacros[] = []
	for (let day = 0; day < 7; day++) {
		const slotsForDay = plan.inventory.flatMap(inv =>
			inv.slots
				.filter(s => s.dayOfWeek === day)
				.map(slot => calculateSlotMacros(getPortionMacros(inv), slot.portions))
		)
		dayTotals.push(calculateDayTotals(slotsForDay))
	}

	const weeklyAvg = calculateWeeklyAverage(dayTotals)
	const filledDays = dayTotals.filter(d => d.kcal > 0).length

	lines.push(`# Weekly Meal Plan: "${plan.name}"`)
	if (filledDays > 0) {
		lines.push(`Weekly average (${filledDays} days): ${fmt(weeklyAvg)}`)
	}

	for (let day = 0; day < 7; day++) {
		lines.push('')
		lines.push(`## ${DAYS[day]}`)

		const meals = plan.inventory.flatMap(inv =>
			inv.slots
				.filter(s => s.dayOfWeek === day)
				.map(slot => {
					const portionMacros = getPortionMacros(inv)
					const slotMacros = calculateSlotMacros(portionMacros, slot.portions)
					const portionLabel = slot.portions === 1 ? '1 portion' : `${slot.portions} portions`
					return `- ${inv.recipe.name} (${portionLabel}): ${fmt(slotMacros)}`
				})
		)

		if (meals.length === 0) {
			lines.push('(no meals planned)')
		} else {
			lines.push(...meals)
			lines.push(`Day total: ${fmt(dayTotals[day])}`)
		}
	}

	return lines.join('\n').trimEnd()
}
