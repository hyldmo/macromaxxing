import { GripVertical, Minus, Plus, RotateCcw, X } from 'lucide-react'
import type { FC } from 'react'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateRemainingPortions,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { cn } from '~/lib/cn'
import { type RouterOutput, trpc } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface InventoryCardProps {
	inventory: InventoryItem
}

export const InventoryCard: FC<InventoryCardProps> = ({ inventory }) => {
	const utils = trpc.useUtils()

	const removeMutation = trpc.mealPlan.removeFromInventory.useMutation({
		onSuccess: () => utils.mealPlan.get.invalidate()
	})

	const updateMutation = trpc.mealPlan.updateInventory.useMutation({
		onSuccess: () => utils.mealPlan.get.invalidate()
	})

	const remaining = calculateRemainingPortions(inventory.totalPortions, inventory.slots)
	const isOverAllocated = remaining < 0

	const recipe = inventory.recipe
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	const portionSize = recipe.portionSize ?? cookedWeight
	const portionMacros = calculatePortionMacros(totals, cookedWeight, portionSize)
	const defaultPortions = portionSize > 0 ? Math.round((cookedWeight / portionSize) * 2) / 2 : 1
	const isAtDefault = inventory.totalPortions === defaultPortions

	function updatePortions(newPortions: number) {
		if (newPortions < 0.5) return
		updateMutation.mutate({ inventoryId: inventory.id, totalPortions: newPortions })
	}

	function resetToDefault() {
		if (defaultPortions !== inventory.totalPortions) {
			updateMutation.mutate({ inventoryId: inventory.id, totalPortions: defaultPortions })
		}
	}

	function handleDragStart(e: React.DragEvent) {
		e.dataTransfer.setData('text/plain', inventory.id)
		e.dataTransfer.effectAllowed = 'copy'
	}

	return (
		<div
			role="group"
			aria-label={`Inventory item for ${inventory.recipe.name}`}
			draggable
			onDragStart={handleDragStart}
			className={cn(
				'cursor-grab rounded-md border bg-surface-1 p-2 active:cursor-grabbing',
				isOverAllocated ? 'border-destructive/50' : 'border-edge'
			)}
		>
			<div className="flex items-start gap-1.5">
				<div className="mt-0.5 text-ink-faint">
					<GripVertical className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-1">
						<span className="truncate font-medium text-ink text-sm">{inventory.recipe.name}</span>
						<button
							type="button"
							onClick={() => removeMutation.mutate({ inventoryId: inventory.id })}
							className="shrink-0 cursor-pointer rounded-sm p-0.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-destructive"
						>
							<X className="size-3.5" />
						</button>
					</div>

					{/* Inline portion controls - only show for recipes with portionSize */}
					{recipe.portionSize != null && (
						<div className="mt-1 flex items-center gap-1">
							<button
								type="button"
								onClick={() => updatePortions(inventory.totalPortions - 0.5)}
								disabled={inventory.totalPortions <= 0.5 || updateMutation.isPending}
								className="cursor-pointer rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
							>
								<Minus className="size-3" />
							</button>
							<span
								className={cn(
									'min-w-12 text-center font-mono text-xs tabular-nums',
									isOverAllocated ? 'text-destructive' : 'text-ink-muted'
								)}
							>
								{remaining}/{inventory.totalPortions}
							</span>
							<button
								type="button"
								onClick={() => updatePortions(inventory.totalPortions + 0.5)}
								disabled={updateMutation.isPending}
								className="cursor-pointer rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
							>
								<Plus className="size-3" />
							</button>
							<button
								type="button"
								onClick={resetToDefault}
								disabled={isAtDefault || updateMutation.isPending}
								title={`Reset to ${defaultPortions} portions`}
								className="ml-1 cursor-pointer rounded-sm p-0.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
							>
								<RotateCcw className="size-3" />
							</button>
						</div>
					)}

					{/* Macros per portion */}
					<div className="mt-1.5 flex items-center gap-2 font-mono text-xs tabular-nums">
						<span className="text-macro-protein">P {portionMacros.protein.toFixed(0)}g</span>
						<span className="text-macro-carbs">C {portionMacros.carbs.toFixed(0)}g</span>
						<span className="text-macro-fat">F {portionMacros.fat.toFixed(0)}g</span>
					</div>
					<div className="mt-0.5 font-bold font-mono text-macro-kcal text-xs tabular-nums">
						{portionMacros.kcal.toFixed(0)} kcal{recipe.portionSize != null && '/portion'}
					</div>
					<div className="mt-1.5">
						<MacroBar protein={portionMacros.protein} carbs={portionMacros.carbs} fat={portionMacros.fat} />
					</div>
				</div>
			</div>
		</div>
	)
}
