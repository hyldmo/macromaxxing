import type { MealPlan } from '@macromaxxing/db'
import { Package, Search, X } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Input, Modal, Spinner, TRPCError } from '~/components/ui'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import { PremadeDialog } from '~/features/recipes/components/PremadeDialog'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'

type Recipe = RouterOutput['recipe']['list'][number]

export interface AddToInventoryModalProps {
	planId: MealPlan['id']
	onClose: () => void
}

export const AddToInventoryModal: FC<AddToInventoryModalProps> = ({ planId, onClose }) => {
	const [search, setSearch] = useState('')
	const [showPremade, setShowPremade] = useState(false)

	const recipesQuery = trpc.recipe.list.useQuery()
	const utils = trpc.useUtils()

	const addMutation = trpc.mealPlan.addToInventory.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate({ id: planId })
			onClose()
		}
	})

	const filtered =
		recipesQuery.data?.filter(r => r.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10) ?? []

	function getRecipePortionMacros(recipe: Recipe) {
		const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
			per100g: ri.ingredient,
			amountGrams: ri.amountGrams
		}))
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
		return calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
	}

	function getDefaultPortions(recipe: Recipe) {
		const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
			per100g: ri.ingredient,
			amountGrams: ri.amountGrams
		}))
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
		if (!recipe.portionSize) return 1
		return Math.round(cookedWeight / recipe.portionSize)
	}

	function handleAdd(recipe: Recipe) {
		addMutation.mutate({
			planId,
			recipeId: recipe.id,
			totalPortions: getDefaultPortions(recipe)
		})
	}

	return (
		<>
			<Modal onClose={onClose} className="w-full max-w-md">
				{/* Header */}
				<div className="flex items-center justify-between border-edge border-b px-4 py-3">
					<h2 className="font-semibold text-ink">Add Recipe</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Content */}
				<div className="p-4">
					{/* Search input */}
					<div className="flex gap-2">
						<div className="relative flex-1">
							<Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
							<Input
								placeholder="Search recipes..."
								value={search}
								onChange={e => setSearch(e.target.value)}
								className="pl-8"
								autoFocus
							/>
						</div>
						<Button variant="outline" className="shrink-0" onClick={() => setShowPremade(true)}>
							<Package className="size-4" />
							Premade
						</Button>
					</div>

					{/* Recipe list */}
					<div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
						{recipesQuery.isLoading && (
							<div className="flex justify-center py-4">
								<Spinner />
							</div>
						)}
						{filtered.map(recipe => {
							const portion = getRecipePortionMacros(recipe)
							const defaultPortions = getDefaultPortions(recipe)
							return (
								<button
									key={recipe.id}
									type="button"
									onClick={() => handleAdd(recipe)}
									disabled={addMutation.isPending}
									className="flex w-full flex-col gap-1 rounded-sm p-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-medium text-ink text-sm">{recipe.name}</span>
										<span className="shrink-0 font-mono text-ink-muted text-xs tabular-nums">
											{defaultPortions} portions
										</span>
									</div>
									<div className="flex items-center gap-2 font-mono text-xs tabular-nums">
										<span className="text-macro-protein">P {portion.protein.toFixed(0)}g</span>
										<span className="text-macro-carbs">C {portion.carbs.toFixed(0)}g</span>
										<span className="text-macro-fat">F {portion.fat.toFixed(0)}g</span>
										<span className="text-macro-kcal">{portion.kcal.toFixed(0)} kcal</span>
									</div>
									<MacroBar protein={portion.protein} carbs={portion.carbs} fat={portion.fat} />
								</button>
							)
						})}
						{filtered.length === 0 && !recipesQuery.isLoading && (
							<div className="py-4 text-center text-ink-faint text-sm">No recipes found</div>
						)}
					</div>

					{addMutation.error && <TRPCError error={addMutation.error} className="mt-3" />}
				</div>
			</Modal>
			<PremadeDialog
				open={showPremade}
				onClose={() => setShowPremade(false)}
				onCreated={recipe => {
					addMutation.mutate({
						planId,
						recipeId: recipe.id,
						totalPortions: getDefaultPortions(recipe)
					})
				}}
			/>
		</>
	)
}
