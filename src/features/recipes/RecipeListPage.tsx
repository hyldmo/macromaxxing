import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Spinner } from '~/components/ui/Spinner'
import { trpc } from '~/lib/trpc'
import { RecipeCard } from './components/RecipeCard'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from './utils/macros'

export function RecipeListPage() {
	const recipesQuery = trpc.recipe.list.useQuery()

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-ink">Recipes</h1>
				<Link to="/recipes/new">
					<Button>
						<Plus className="h-4 w-4" />
						New Recipe
					</Button>
				</Link>
			</div>

			{recipesQuery.isLoading && (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			)}

			{recipesQuery.data?.length === 0 && (
				<Card className="py-12 text-center text-ink-faint">No recipes yet. Create your first one!</Card>
			)}

			<div className="grid gap-2">
				{recipesQuery.data?.map(recipe => {
					const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
						per100g: ri.ingredient,
						amountGrams: ri.amountGrams
					}))
					const totals = calculateRecipeTotals(items)
					const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
					const portion = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)

					return (
						<RecipeCard
							key={recipe.id}
							id={recipe.id}
							name={recipe.name}
							ingredientCount={recipe.recipeIngredients.length}
							portionSize={recipe.portionSize}
							portion={portion}
						/>
					)
				})}
			</div>
		</div>
	)
}
