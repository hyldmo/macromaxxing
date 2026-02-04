import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Spinner } from '~/components/ui/Spinner'
import { trpc } from '~/lib/trpc'
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
						<Link key={recipe.id} to={`/recipes/${recipe.id}`}>
							<Card className="p-3 transition-colors hover:bg-surface-2">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="font-medium text-ink text-sm">{recipe.name}</h2>
										<p className="text-ink-faint text-xs">
											{recipe.recipeIngredients.length} ingredients
											{recipe.cookedWeight ? ` \u00B7 ${recipe.cookedWeight}g cooked` : ''}
											{` \u00B7 ${recipe.portionSize}g portion`}
										</p>
									</div>
									{recipe.recipeIngredients.length > 0 && (
										<div className="text-right font-mono text-sm">
											<div className="font-medium text-macro-kcal">
												{portion.kcal.toFixed(0)} kcal
											</div>
											<div className="space-x-2 text-xs">
												<span className="text-macro-protein">
													P{portion.protein.toFixed(0)}
												</span>
												<span className="text-macro-carbs">C{portion.carbs.toFixed(0)}</span>
												<span className="text-macro-fat">F{portion.fat.toFixed(0)}</span>
											</div>
										</div>
									)}
								</div>
							</Card>
						</Link>
					)
				})}
			</div>
		</div>
	)
}
