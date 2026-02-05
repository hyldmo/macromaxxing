import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { cn } from '~/lib/cn'
import { trpc } from '~/lib/trpc'
import { getUserId } from '~/lib/user'
import { RecipeCard } from './components/RecipeCard'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from './utils/macros'

type Filter = 'all' | 'mine'

export function RecipeListPage() {
	const [filter, setFilter] = useState<Filter>('all')
	const userId = getUserId()
	const recipesQuery = trpc.recipe.listPublic.useQuery()

	const filteredRecipes = filter === 'mine' ? recipesQuery.data?.filter(r => r.userId === userId) : recipesQuery.data

	const myRecipeCount = recipesQuery.data?.filter(r => r.userId === userId).length ?? 0

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h1 className="font-semibold text-ink">Recipes</h1>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => setFilter('all')}
							className={cn(
								'rounded-full px-2.5 py-0.5 text-xs transition-colors',
								filter === 'all' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'
							)}
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setFilter('mine')}
							className={cn(
								'rounded-full px-2.5 py-0.5 text-xs transition-colors',
								filter === 'mine'
									? 'bg-accent text-white'
									: 'bg-surface-2 text-ink-muted hover:text-ink'
							)}
						>
							Mine{myRecipeCount > 0 && ` (${myRecipeCount})`}
						</button>
					</div>
				</div>
				<Link to="/recipes/new">
					<Button>
						<Plus className="size-4" />
						New Recipe
					</Button>
				</Link>
			</div>

			{recipesQuery.isLoading && (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			)}

			{recipesQuery.error && <TRPCError error={recipesQuery.error} />}

			{filteredRecipes?.length === 0 && (
				<Card className="py-12 text-center text-ink-faint">
					{filter === 'mine'
						? "You haven't created any recipes yet."
						: 'No recipes yet. Create the first one!'}
				</Card>
			)}

			<div className="grid gap-2">
				{filteredRecipes?.map(recipe => {
					const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
						per100g: ri.ingredient,
						amountGrams: ri.amountGrams
					}))
					const totals = calculateRecipeTotals(items)
					const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
					const portion = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
					const isMine = recipe.userId === userId

					return (
						<RecipeCard
							key={recipe.id}
							id={recipe.id}
							name={recipe.name}
							ingredientCount={recipe.recipeIngredients.length}
							portionSize={recipe.portionSize}
							portion={portion}
							isMine={isMine}
						/>
					)
				})}
			</div>
		</div>
	)
}
