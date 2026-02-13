import type { AbsoluteMacros } from '~/lib/macros'
import type { RouterOutput } from '~/lib/trpc'
import { formatIngredientAmount } from './format'

type Recipe = RouterOutput['recipe']['get']

interface RecipeCalculations {
	totals: AbsoluteMacros
	cookedWeight: number
	portionSize: number
	portion: AbsoluteMacros
}

function fmt(m: AbsoluteMacros): string {
	return `${m.kcal.toFixed(0)} kcal | P ${m.protein.toFixed(0)}g | C ${m.carbs.toFixed(0)}g | F ${m.fat.toFixed(0)}g | Fiber ${m.fiber.toFixed(0)}g`
}

function formatIngredientLine(ri: Recipe['recipeIngredients'][number]): string {
	const name = ri.subrecipe?.name ?? ri.ingredient?.name ?? 'Unknown'

	// Use display unit/amount if set, otherwise fall back to grams
	let amount: string
	if (ri.subrecipe) {
		const portions = ri.displayAmount ?? 1
		amount = portions === 1 ? '1 portion' : `${portions} portions`
	} else if (ri.displayUnit && ri.displayAmount) {
		amount = formatIngredientAmount(ri.displayAmount, ri.displayUnit)
	} else {
		amount = `${Math.round(ri.amountGrams)}g`
	}

	const prep = ri.preparation ? ` (${ri.preparation})` : ''
	return `- ${amount} ${name}${prep}`
}

/** Format a recipe as LLM-friendly markdown */
export function formatRecipe(recipe: Recipe, calculations: RecipeCalculations): string {
	const lines: string[] = []

	lines.push(`# Recipe: ${recipe.name}`)

	const portions = Math.round(calculations.cookedWeight / calculations.portionSize)
	if (portions > 1) {
		lines.push(
			`Portion size: ${Math.round(calculations.portionSize)}g (cooked weight: ${Math.round(calculations.cookedWeight)}g, ${portions} portions)`
		)
	} else if (recipe.cookedWeight) {
		lines.push(`Cooked weight: ${Math.round(calculations.cookedWeight)}g`)
	}

	if (recipe.recipeIngredients.length > 0) {
		lines.push('')
		lines.push('## Ingredients')
		for (const ri of recipe.recipeIngredients) {
			lines.push(formatIngredientLine(ri))
		}
	}

	lines.push('')
	lines.push('## Per Portion')
	lines.push(fmt(calculations.portion))

	lines.push('')
	lines.push('## Totals (full recipe)')
	lines.push(fmt(calculations.totals))

	if (recipe.instructions?.trim()) {
		lines.push('')
		lines.push('## Method')
		lines.push(recipe.instructions.trim())
	}

	return lines.join('\n').trimEnd()
}
