import { Import, Package, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { cn } from '~/lib/cn'
import { trpc } from '~/lib/trpc'
import { useUser } from '~/lib/user'
import { PremadeDialog } from './components/PremadeDialog'
import { RecipeCard } from './components/RecipeCard'
import { RecipeImportDialog } from './components/RecipeImportDialog'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from './utils/macros'

type Filter = 'all' | 'mine' | 'premade'
type Sort = 'recent' | 'protein' | 'calories' | 'name'

const sortLabels: Record<Sort, string> = {
	recent: 'Recent',
	protein: 'Protein',
	calories: 'Calories',
	name: 'Name'
}

export function RecipeListPage() {
	const [filter, setFilter] = useState<Filter>('all')
	const [sort, setSort] = useState<Sort>('recent')
	const [showImport, setShowImport] = useState(false)
	const [showPremade, setShowPremade] = useState(false)
	const navigate = useNavigate()
	const { user } = useUser()
	const recipesQuery = trpc.recipe.list.useQuery()

	const recipesWithMacros = useMemo(() => {
		if (!recipesQuery.data) return []
		return recipesQuery.data.map(recipe => {
			const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
				per100g: ri.ingredient,
				amountGrams: ri.amountGrams
			}))
			const totals = calculateRecipeTotals(items)
			const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
			const portion = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
			return { recipe, portion, isMine: recipe.userId === user?.id }
		})
	}, [recipesQuery.data, user?.id])

	const sortedRecipes = useMemo(() => {
		const filtered = recipesWithMacros.filter(r => {
			if (filter === 'mine') return r.isMine && r.recipe.type !== 'premade'
			if (filter === 'premade') return r.isMine && r.recipe.type === 'premade'
			return r.recipe.type !== 'premade'
		})
		return [...filtered].sort((a, b) => {
			switch (sort) {
				case 'protein':
					return b.portion.protein - a.portion.protein
				case 'calories':
					return a.portion.kcal - b.portion.kcal
				case 'name':
					return a.recipe.name.localeCompare(b.recipe.name)
				default:
					return b.recipe.updatedAt - a.recipe.updatedAt
			}
		})
	}, [recipesWithMacros, filter, sort])

	const myRecipeCount = recipesWithMacros.filter(r => r.isMine && r.recipe.type !== 'premade').length
	const premadeCount = recipesWithMacros.filter(r => r.isMine && r.recipe.type === 'premade').length

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<h1 className="font-semibold text-ink">Recipes</h1>
					{user && (
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => setFilter('all')}
								className={cn(
									'rounded-full px-2.5 py-0.5 text-xs transition-colors',
									filter === 'all'
										? 'bg-accent text-white'
										: 'bg-surface-2 text-ink-muted hover:text-ink'
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
							<button
								type="button"
								onClick={() => setFilter('premade')}
								className={cn(
									'rounded-full px-2.5 py-0.5 text-xs transition-colors',
									filter === 'premade'
										? 'bg-accent text-white'
										: 'bg-surface-2 text-ink-muted hover:text-ink'
								)}
							>
								Premade{premadeCount > 0 && ` (${premadeCount})`}
							</button>
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					<select
						value={sort}
						onChange={e => setSort(e.target.value as Sort)}
						className="h-7 rounded-full border-none bg-surface-2 px-2.5 pr-7 text-ink-muted text-xs transition-colors hover:text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
					>
						{(Object.keys(sortLabels) as Sort[]).map(key => (
							<option key={key} value={key}>
								{sortLabels[key]}
							</option>
						))}
					</select>
					{user && (
						<>
							<Button variant="outline" onClick={() => setShowImport(true)}>
								<Import className="size-4" />
								Import
							</Button>
							<Button variant="outline" onClick={() => setShowPremade(true)}>
								<Package className="size-4" />
								Premade
							</Button>
							<Link to="/recipes/new">
								<Button>
									<Plus className="size-4" />
									New Recipe
								</Button>
							</Link>
						</>
					)}
				</div>
			</div>

			{recipesQuery.isLoading && (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			)}

			{recipesQuery.error && <TRPCError error={recipesQuery.error} />}

			{sortedRecipes.length === 0 && !recipesQuery.isLoading && (
				<Card className="py-12 text-center text-ink-faint">
					{filter === 'premade'
						? "You haven't added any premade meals yet."
						: filter === 'mine'
							? "You haven't created any recipes yet."
							: 'No recipes yet. Create the first one!'}
				</Card>
			)}

			<div className="grid gap-2">
				{sortedRecipes.map(({ recipe, portion, isMine }) => (
					<RecipeCard
						key={recipe.id}
						id={recipe.id}
						name={recipe.name}
						type={recipe.type}
						ingredientCount={recipe.recipeIngredients.length}
						portionSize={recipe.portionSize}
						portion={portion}
						isMine={isMine}
					/>
				))}
			</div>
			<RecipeImportDialog open={showImport} onClose={() => setShowImport(false)} />
			<PremadeDialog
				open={showPremade}
				onClose={() => setShowPremade(false)}
				onCreated={recipe => navigate(`/recipes/${recipe.id}`)}
			/>
		</div>
	)
}
