import type { MealPlan } from '@macromaxxing/db'
import { keepPreviousData } from '@tanstack/react-query'
import { Package, ScanLine, Search, X } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Input, Modal, NumberInput, Select, Spinner, TRPCError } from '~/components/ui'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import { PremadeDialog } from '~/features/recipes/components/PremadeDialog'
import { getAllUnits, resolveUnitGrams } from '~/features/recipes/utils/format'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'

/** Lean picker row: `recipe.search` prices the portion server-side, so no ingredients come down. */
type RecipeHit = RouterOutput['recipe']['search'][number]
type PremadeRecipe = NonNullable<RouterOutput['recipe']['addPremade']>
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

/** Only the premade dialog still hands us a full recipe — search results carry `defaultPortions`. */
function getDefaultPortions(recipe: PremadeRecipe) {
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	if (!recipe.portionSize) return 1
	return Math.round(cookedWeight / recipe.portionSize)
}

export const AddToInventoryModal: FC<AddToInventoryModalProps> = ({ planId, onClose, slotAllocation }) => {
	const [search, setSearch] = useState('')
	// Both entry points land in the same editable form — a scan only decides whether it opens
	// straight into the camera. Committing an Open Food Facts payload unseen is how a mis-tagged
	// record (per-100 values filed as a whole-package serving) gets stored without anyone noticing.
	const [premadeMode, setPremadeMode] = useState<'manual' | 'scan' | null>(null)
	// Picking a bare ingredient needs an amount, so it's a two-step: select, then confirm the amount.
	const [selectedIngredient, setSelectedIngredient] = useState<IngredientOption | null>(null)
	const [amountInput, setAmountInput] = useState('100')
	// The unit an amount is *entered* in. Grams stay the storage unit — this only decides the
	// multiplier — so a piece unit here is exactly as precise as the ingredient's own table.
	const [unitName, setUnitName] = useState('g')
	const amount = Number(amountInput) || 0

	const ingredientUnits = selectedIngredient ? getAllUnits(selectedIngredient.units, selectedIngredient.density) : []
	// Units are the ingredient's own rows plus the volume ones its density implies; 'g' is always
	// offered even when an ingredient carries no unit table at all.
	const unitOptions = [
		{ label: 'g', value: 'g' },
		...ingredientUnits.filter(u => u.name !== 'g').map(u => ({ label: u.name, value: u.name }))
	]
	const gramsPerUnit = selectedIngredient
		? (resolveUnitGrams(unitName, selectedIngredient.units, selectedIngredient.density) ?? 1)
		: 1
	const grams = amount * gramsPerUnit

	function selectIngredient(ingredient: IngredientOption) {
		setSelectedIngredient(ingredient)
		// Default to the ingredient's own default unit — an egg logs as pieces, flour as grams —
		// and seed a sensible amount for it: 100 g, but 1 of anything countable.
		const preferred = ingredient.units.find(u => u.isDefault && u.name !== 'g')
		setUnitName(preferred?.name ?? 'g')
		setAmountInput(preferred ? '1' : '100')
	}

	// Server-side name match, so a recipe outside the most-recently-touched page is still findable.
	// Each keystroke is a new query key, so hold the last results rather than blanking to a spinner.
	// Slot mode renders nothing until you type, so don't fetch a page it won't show.
	const recipesQuery = trpc.recipe.search.useQuery(
		{ search: search || undefined },
		{ enabled: !slotAllocation || search.length > 0, placeholderData: keepPreviousData }
	)
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

	const isPending = addMutation.isPending || allocateMutation.isPending || logMealMutation.isPending

	const inventoryRecipeIds = slotAllocation ? new Set(slotAllocation.inventory.map(inv => inv.recipe.id)) : undefined

	// Premades are searchable here on purpose. They're the single most loggable thing a user owns —
	// a bought item eaten as-is — and the "Premade" button only creates NEW ones, so filtering the
	// existing ones out left re-creating the same product from its label as the only way to log it.
	// Name matching is the server's job now; the only client-side cut is what's already in inventory,
	// which is a local fact the query can't know.
	const filtered = recipesQuery.data?.filter(r => !inventoryRecipeIds?.has(r.id)).slice(0, 10) ?? []

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

	function handleAdd(recipe: RecipeHit) {
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
			totalPortions: recipe.defaultPortions
		})
	}

	function handleLogIngredient() {
		if (!(slotAllocation && selectedIngredient)) return
		logMealMutation.mutate({
			planId,
			dayOfWeek: slotAllocation.dayOfWeek,
			slotIndex: slotAllocation.slotIndex,
			// Sent as amount + unit rather than pre-multiplied grams: the server owns the conversion,
			// so the number stored can't drift from what mealPlan.logMeal would compute for an agent.
			entry: { kind: 'ingredient', ingredientId: selectedIngredient.id, amount, unit: unitName }
		})
	}

	function handlePremadeCreated(recipe: PremadeRecipe) {
		if (slotAllocation) {
			logMealMutation.mutate({
				planId,
				dayOfWeek: slotAllocation.dayOfWeek,
				slotIndex: slotAllocation.slotIndex,
				entry: { kind: 'recipe', recipeId: recipe.id, portions: 1 }
			})
			return
		}
		addMutation.mutate({ planId, recipeId: recipe.id, totalPortions: getDefaultPortions(recipe) })
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
				{selectedIngredient ? (
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
						<div className="flex items-center gap-2 text-ink-muted text-sm">
							<label htmlFor="log-ingredient-amount">Amount</label>
							<NumberInput
								id="log-ingredient-amount"
								value={amountInput}
								onChange={e => setAmountInput(e.target.value)}
								className="h-8 w-24"
								min={0}
								autoFocus
							/>
							{unitOptions.length > 1 ? (
								<Select
									className="h-8 w-24 font-mono"
									value={unitName}
									onChange={setUnitName}
									options={unitOptions}
								/>
							) : (
								<span>g</span>
							)}
							{/* The gram equivalent stays visible: it's the number actually stored, and it's the
							    only way to notice a unit whose weight is wrong before it lands in the log. */}
							{unitName !== 'g' && (
								<span className="font-mono text-ink-faint text-xs tabular-nums">
									({Math.round(grams)} g)
								</span>
							)}
						</div>
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
							<Button variant="outline" className="shrink-0" onClick={() => setPremadeMode('scan')}>
								<ScanLine className="size-4" />
								Scan
							</Button>
							{!slotAllocation && (
								<Button variant="outline" className="shrink-0" onClick={() => setPremadeMode('manual')}>
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
									const portion = recipe.portionMacros
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
														{/* A premade's package IS the portion, so it always adds as one
														    countable item — "1 portions" reads like a bug. */}
														{recipe.type === 'premade'
															? '1 item'
															: `${recipe.defaultPortions} portions`}
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
											onClick={() => selectIngredient(ingredient)}
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

						{/* logMeal lands here too: the premade dialog closes on create, so a failure of the
						    follow-up log has nowhere else to surface */}
						{(addMutation.error || allocateMutation.error || logMealMutation.error) && (
							<TRPCError
								error={addMutation.error || allocateMutation.error || logMealMutation.error}
								className="mt-3"
							/>
						)}
					</div>
				)}
			</Modal>
			{/* Mounted per-open so `autoScan` seeds the scanner state on a fresh mount */}
			{premadeMode && (
				<PremadeDialog
					open
					autoScan={premadeMode === 'scan'}
					onClose={() => setPremadeMode(null)}
					onCreated={handlePremadeCreated}
				/>
			)}
		</>
	)
}
