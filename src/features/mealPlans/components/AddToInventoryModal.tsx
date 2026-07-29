import type { MealPlan } from '@macromaxxing/db'
import { ArrowLeft, Package, ScanLine, Search, X } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Input, Modal, NumberInput, Spinner, TRPCError } from '~/components/ui'
import { BarcodeLookup } from '~/features/recipes/components/BarcodeLookup'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import { PremadeDialog } from '~/features/recipes/components/PremadeDialog'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import type { OFFProduct } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'

type Recipe = RouterOutput['recipe']['list'][number]
type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type IngredientOption = RouterOutput['ingredient']['list'][number]

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
	const [scanMode, setScanMode] = useState(false)
	const [scannedProduct, setScannedProduct] = useState<OFFProduct | null>(null)
	// Picking a bare ingredient needs an amount, so it's a two-step: select, then confirm grams.
	const [selectedIngredient, setSelectedIngredient] = useState<IngredientOption | null>(null)
	const [gramsInput, setGramsInput] = useState('100')
	const grams = Number(gramsInput) || 0

	const recipesQuery = trpc.recipe.list.useQuery()
	// Bare ingredients are a logging affordance — when planning a cook-up you add recipes, not raw grams.
	const ingredientsQuery = trpc.ingredient.list.useQuery(
		{ search },
		{ enabled: Boolean(slotAllocation) && search.length > 1 }
	)
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

	const addPremadeMutation = trpc.recipe.addPremade.useMutation({
		onSuccess: recipe => {
			if (!recipe) return
			utils.recipe.list.invalidate()
			addMutation.mutate({
				planId,
				recipeId: recipe.id,
				totalPortions: getDefaultPortions(recipe)
			})
		}
	})

	// Logging goes straight onto the day in one call. `addToInventory` stays the planning verb: it
	// declares a portion pool up front, so over-allocating a cook-up still warns.
	const logMealMutation = trpc.mealPlan.logMeal.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate({ id: planId })
			// The week calendar and dashboard read plans off the summary, not mealPlan.get, and the
			// plan list carries its own inventory count — without this it keeps reporting the old one.
			utils.dashboard.summary.invalidate()
			utils.mealPlan.list.invalidate()
			utils.recipe.list.invalidate()
			onClose()
		}
	})

	const isPending =
		addMutation.isPending || allocateMutation.isPending || addPremadeMutation.isPending || logMealMutation.isPending

	function handleConfirmScanned() {
		if (!scannedProduct) return
		addPremadeMutation.mutate({
			name: scannedProduct.name,
			servingSize: scannedProduct.servingSize,
			servings: scannedProduct.servings ?? 1,
			protein: scannedProduct.protein,
			carbs: scannedProduct.carbs,
			fat: scannedProduct.fat,
			kcal: scannedProduct.kcal,
			fiber: scannedProduct.fiber,
			sourceUrl: `https://world.openfoodfacts.org/product/${scannedProduct.barcode}`
		})
	}

	function exitScan() {
		setScanMode(false)
		setScannedProduct(null)
	}

	const inventoryRecipeIds = slotAllocation ? new Set(slotAllocation.inventory.map(inv => inv.recipe.id)) : undefined

	const filtered =
		recipesQuery.data
			?.filter(r => r.type !== 'premade')
			.filter(r => !inventoryRecipeIds?.has(r.id))
			.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
			.slice(0, 10) ?? []

	const query = search.toLowerCase()
	// Ingredient wrappers are excluded from the quick-picks on purpose. They'd duplicate the row the
	// Ingredients section already shows, and the quick-pick allocates a fixed 1 portion through
	// `allocate` — which doesn't grow the pool, so re-logging one would trip the over-allocation
	// warning that logging is supposed to stay clear of. Re-log via Ingredients, which sets the amount.
	const loggableInventory = slotAllocation?.inventory.filter(inv => inv.recipe.type !== 'ingredient')
	const filteredInventory = loggableInventory
		? query
			? loggableInventory.filter(inv => inv.recipe.name.toLowerCase().includes(query))
			: loggableInventory
		: undefined

	const filteredIngredients =
		ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(query)).slice(0, 5) ?? []

	function handleAdd(recipe: Recipe) {
		if (slotAllocation) {
			logMealMutation.mutate({
				planId,
				dayOfWeek: slotAllocation.dayOfWeek,
				slotIndex: slotAllocation.slotIndex,
				entry: { kind: 'recipe', recipeId: recipe.id, portions: 1 }
			})
			return
		}
		addMutation.mutate({
			planId,
			recipeId: recipe.id,
			totalPortions: getDefaultPortions(recipe)
		})
	}

	function handleLogIngredient() {
		if (!(slotAllocation && selectedIngredient)) return
		logMealMutation.mutate({
			planId,
			dayOfWeek: slotAllocation.dayOfWeek,
			slotIndex: slotAllocation.slotIndex,
			entry: { kind: 'ingredient', ingredientId: selectedIngredient.id, grams }
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
					<div className="flex items-center gap-2">
						{scanMode && (
							<button
								type="button"
								onClick={exitScan}
								className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
							>
								<ArrowLeft className="size-4" />
							</button>
						)}
						<h2 className="font-semibold text-ink">
							{scanMode ? 'Scan barcode' : slotAllocation ? 'Add meal' : 'Add Recipe'}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Content */}
				{scanMode ? (
					<div className="p-4">
						{scannedProduct ? (
							<div className="space-y-3">
								<div className="rounded-sm border border-edge p-3">
									<div className="font-medium text-ink text-sm">{scannedProduct.name}</div>
									{scannedProduct.brand && (
										<div className="text-ink-faint text-xs">{scannedProduct.brand}</div>
									)}
									<div className="mt-2 text-ink-muted text-xs">
										Per serving ({scannedProduct.servingSize}g
										{scannedProduct.servings && scannedProduct.servings > 1
											? ` × ${scannedProduct.servings}`
											: ''}
										)
									</div>
									<div className="mt-1 flex items-center gap-3 font-mono text-xs tabular-nums">
										<span className="text-macro-protein">P{scannedProduct.protein.toFixed(0)}</span>
										<span className="text-macro-carbs">C{scannedProduct.carbs.toFixed(0)}</span>
										<span className="text-macro-fat">F{scannedProduct.fat.toFixed(0)}</span>
										<span className="text-macro-kcal">{scannedProduct.kcal.toFixed(0)}</span>
										<span className="text-macro-fiber">Fb{scannedProduct.fiber.toFixed(0)}</span>
									</div>
								</div>
								{(addPremadeMutation.error || addMutation.error || allocateMutation.error) && (
									<TRPCError
										error={addPremadeMutation.error || addMutation.error || allocateMutation.error}
									/>
								)}
								<div className="flex justify-end gap-2">
									<Button variant="ghost" onClick={exitScan} disabled={isPending}>
										Cancel
									</Button>
									<Button onClick={handleConfirmScanned} disabled={isPending}>
										{isPending ? <Spinner className="size-4 text-current" /> : 'Add'}
									</Button>
								</div>
							</div>
						) : (
							<BarcodeLookup active onProductFound={setScannedProduct} />
						)}
					</div>
				) : selectedIngredient ? (
					<div className="space-y-3 p-4">
						<div className="rounded-sm border border-edge p-3">
							<div className="font-medium text-ink text-sm">{selectedIngredient.name}</div>
							<div className="mt-1 flex items-center gap-3 font-mono text-xs tabular-nums">
								<span className="text-macro-protein">
									P{((selectedIngredient.protein * grams) / 100).toFixed(0)}
								</span>
								<span className="text-macro-carbs">
									C{((selectedIngredient.carbs * grams) / 100).toFixed(0)}
								</span>
								<span className="text-macro-fat">
									F{((selectedIngredient.fat * grams) / 100).toFixed(0)}
								</span>
								<span className="text-macro-kcal">
									{((selectedIngredient.kcal * grams) / 100).toFixed(0)}
								</span>
							</div>
						</div>
						<label className="flex items-center gap-2 text-ink-muted text-sm">
							Amount
							<NumberInput
								value={gramsInput}
								onChange={e => setGramsInput(e.target.value)}
								className="h-8 w-24"
								min={0}
								autoFocus
							/>
							g
						</label>
						{logMealMutation.error && <TRPCError error={logMealMutation.error} />}
						<div className="flex justify-end gap-2">
							<Button variant="ghost" onClick={() => setSelectedIngredient(null)} disabled={isPending}>
								Back
							</Button>
							<Button onClick={handleLogIngredient} disabled={isPending || grams <= 0}>
								{isPending ? <Spinner className="size-4 text-current" /> : 'Add'}
							</Button>
						</div>
					</div>
				) : (
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
							<Button variant="outline" className="shrink-0" onClick={() => setScanMode(true)}>
								<ScanLine className="size-4" />
								Scan
							</Button>
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
													<span className="text-macro-protein">
														P{macros.protein.toFixed(0)}
													</span>
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
												<span className="truncate font-medium text-ink text-sm">
													{recipe.name}
												</span>
												{!slotAllocation && (
													<span className="shrink-0 font-mono text-ink-muted text-xs tabular-nums">
														{defaultPortions} portions
													</span>
												)}
											</div>
											<div className="flex items-center gap-2 font-mono text-xs tabular-nums">
												<span className="text-macro-protein">
													P{portion.protein.toFixed(0)}
												</span>
												<span className="text-macro-carbs">C{portion.carbs.toFixed(0)}</span>
												<span className="text-macro-fat">F{portion.fat.toFixed(0)}</span>
												<span className="text-macro-kcal">{portion.kcal.toFixed(0)}</span>
											</div>
											{!slotAllocation && <MacroBar macros={portion} />}
										</button>
									)
								})}

							{/* Bare ingredients — logged by weight, no recipe needed */}
							{filteredIngredients.length > 0 && (
								<>
									<div className="border-edge border-t pt-1">
										<div className="px-2 pb-1 font-semibold text-[10px] text-ink-faint uppercase tracking-wider">
											Ingredients
										</div>
									</div>
									{filteredIngredients.map(ingredient => (
										<button
											key={ingredient.id}
											type="button"
											onClick={() => setSelectedIngredient(ingredient)}
											disabled={isPending}
											className="flex w-full flex-col gap-0.5 rounded-sm p-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
										>
											<span className="truncate font-medium text-ink text-sm">
												{ingredient.name}
											</span>
											<div className="flex items-center gap-2 font-mono text-xs tabular-nums">
												<span className="text-macro-protein">
													P{ingredient.protein.toFixed(0)}
												</span>
												<span className="text-macro-carbs">C{ingredient.carbs.toFixed(0)}</span>
												<span className="text-macro-fat">F{ingredient.fat.toFixed(0)}</span>
												<span className="text-macro-kcal">{ingredient.kcal.toFixed(0)}</span>
												<span className="text-ink-faint">/100g</span>
											</div>
										</button>
									))}
								</>
							)}

							{/* Empty states */}
							{filtered.length === 0 &&
								filteredIngredients.length === 0 &&
								(!filteredInventory || filteredInventory.length === 0) &&
								!recipesQuery.isLoading && (
									<div className="py-4 text-center text-ink-faint text-sm">No recipes found</div>
								)}
						</div>

						{(addMutation.error || allocateMutation.error) && (
							<TRPCError error={addMutation.error || allocateMutation.error} className="mt-3" />
						)}
					</div>
				)}
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
