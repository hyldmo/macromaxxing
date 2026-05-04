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
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'

type Recipe = RouterOutput['recipe']['list'][number]
type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface AddToInventoryModalProps {
	planId: MealPlan['id']
	onClose: () => void
	/** When provided, show inventory quick-picks and allocate to slot after adding */
	slotAllocation?: {
		dayOfWeek: number
		slotIndex: number
		inventory: InventoryItem[]
	}
}

function getRecipePortionMacros(recipe: {
	recipeIngredients: Parameters<typeof toIngredientWithAmount>[0][]
	cookedWeight: number | null
	portionSize: number | null
}) {
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	return calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
}

function getDefaultPortions(recipe: Recipe) {
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	if (!recipe.portionSize) return 1
	return Math.round(cookedWeight / recipe.portionSize)
}

export const AddToInventoryModal: FC<AddToInventoryModalProps> = ({ planId, onClose, slotAllocation }) => {
	const [search, setSearch] = useState('')
	const [showPremade, setShowPremade] = useState(false)

	const recipesQuery = trpc.recipe.list.useQuery()
	const utils = trpc.useUtils()

	const allocateMutation = trpc.mealPlan.allocate.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate()
			onClose()
		}
	})

	const addMutation = trpc.mealPlan.addToInventory.useMutation({
		onSuccess: data => {
			utils.mealPlan.get.invalidate({ id: planId })
			if (slotAllocation && data) {
				allocateMutation.mutate({
					inventoryId: data.id,
					dayOfWeek: slotAllocation.dayOfWeek,
					slotIndex: slotAllocation.slotIndex,
					portions: 1
				})
			} else {
				onClose()
			}
		}
	})

	const isPending = addMutation.isPending || allocateMutation.isPending

	const inventoryRecipeIds = slotAllocation ? new Set(slotAllocation.inventory.map(inv => inv.recipe.id)) : undefined

	const filtered =
		recipesQuery.data
			?.filter(r => r.type !== 'premade')
			.filter(r => !inventoryRecipeIds?.has(r.id))
			.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
			.slice(0, 10) ?? []

	const query = search.toLowerCase()
	const filteredInventory = slotAllocation
		? query
			? slotAllocation.inventory.filter(inv => inv.recipe.name.toLowerCase().includes(query))
			: slotAllocation.inventory
		: undefined

	function handleAdd(recipe: Recipe) {
		addMutation.mutate({
			planId,
			recipeId: recipe.id,
			totalPortions: getDefaultPortions(recipe)
		})
	}

	function handleAllocateExisting(inv: InventoryItem) {
		if (!slotAllocation) return
		allocateMutation.mutate({
			inventoryId: inv.id,
			dayOfWeek: slotAllocation.dayOfWeek,
			slotIndex: slotAllocation.slotIndex,
			portions: 1
		})
	}

	return (
		<>
			<Modal onClose={onClose} className="w-full max-w-md">
				{/* Header */}
				<div className="flex items-center justify-between border-edge border-b px-4 py-3">
					<h2 className="font-semibold text-ink">{slotAllocation ? 'Add meal' : 'Add Recipe'}</h2>
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
						{!slotAllocation && (
							<Button variant="outline" className="shrink-0" onClick={() => setShowPremade(true)}>
								<Package className="size-4" />
								Premade
							</Button>
						)}
					</div>

					{/* Results */}
					<div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
						{recipesQuery.isLoading && (
							<div className="flex justify-center py-4">
								<Spinner />
							</div>
						)}

						{/* Inventory quick-picks (slot mode only) */}
						{filteredInventory && filteredInventory.length > 0 && (
							<>
								{search && (
									<div className="px-2 pb-1 font-semibold text-[10px] text-ink-faint uppercase tracking-wider">
										In inventory
									</div>
								)}
								{filteredInventory.map(inv => {
									const macros = getRecipePortionMacros(inv.recipe)
									return (
										<button
											key={inv.id}
											type="button"
											onClick={() => handleAllocateExisting(inv)}
											disabled={isPending}
											className="flex w-full flex-col gap-0.5 rounded-sm p-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
										>
											<span className="truncate font-medium text-ink text-sm">
												{inv.recipe.name}
											</span>
											<div className="flex items-center gap-2 font-mono text-ink-muted text-xs tabular-nums">
												<span className="text-macro-protein">P{macros.protein.toFixed(0)}</span>
												<span className="text-macro-carbs">C{macros.carbs.toFixed(0)}</span>
												<span className="text-macro-fat">F{macros.fat.toFixed(0)}</span>
												<span className="text-macro-kcal">{macros.kcal.toFixed(0)}</span>
											</div>
										</button>
									)
								})}
							</>
						)}

						{/* Separator between inventory and recipes in slot mode */}
						{slotAllocation &&
							filteredInventory &&
							filteredInventory.length > 0 &&
							filtered.length > 0 &&
							search && (
								<div className="border-edge border-t pt-1">
									<div className="px-2 pb-1 font-semibold text-[10px] text-ink-faint uppercase tracking-wider">
										Add to plan
									</div>
								</div>
							)}

						{/* Recipe search results */}
						{(!slotAllocation || search) &&
							filtered.map(recipe => {
								const portion = getRecipePortionMacros(recipe)
								const defaultPortions = getDefaultPortions(recipe)
								return (
									<button
										key={recipe.id}
										type="button"
										onClick={() => handleAdd(recipe)}
										disabled={isPending}
										className="flex w-full flex-col gap-1 rounded-sm p-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium text-ink text-sm">{recipe.name}</span>
											{!slotAllocation && (
												<span className="shrink-0 font-mono text-ink-muted text-xs tabular-nums">
													{defaultPortions} portions
												</span>
											)}
										</div>
										<div className="flex items-center gap-2 font-mono text-xs tabular-nums">
											<span className="text-macro-protein">P{portion.protein.toFixed(0)}</span>
											<span className="text-macro-carbs">C{portion.carbs.toFixed(0)}</span>
											<span className="text-macro-fat">F{portion.fat.toFixed(0)}</span>
											<span className="text-macro-kcal">{portion.kcal.toFixed(0)}</span>
										</div>
										{!slotAllocation && <MacroBar macros={portion} />}
									</button>
								)
							})}

						{/* Empty states */}
						{filtered.length === 0 &&
							(!filteredInventory || filteredInventory.length === 0) &&
							!recipesQuery.isLoading && (
								<div className="py-4 text-center text-ink-faint text-sm">No recipes found</div>
							)}
					</div>

					{(addMutation.error || allocateMutation.error) && (
						<TRPCError error={addMutation.error || allocateMutation.error} className="mt-3" />
					)}
				</div>
			</Modal>
			{!slotAllocation && (
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
			)}
		</>
	)
}
