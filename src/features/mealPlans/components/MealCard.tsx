import { Minus, MoreVertical, Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	type IngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { MealPopover } from './MealPopover'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type SlotWithInventory = InventoryItem['slots'][number] & { inventory: InventoryItem }

export interface MealCardProps {
	slot: SlotWithInventory
	inventory: InventoryItem[]
}

export const MealCard: FC<MealCardProps> = ({ slot, inventory }) => {
	const [showPopover, setShowPopover] = useState(false)

	const utils = trpc.useUtils()
	const updateMutation = trpc.mealPlan.updateSlot.useMutation({
		onSuccess: () => utils.mealPlan.get.invalidate()
	})

	// Calculate macros based on current portions
	const recipe = slot.inventory.recipe
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(ri => ({
		per100g: ri.ingredient,
		amountGrams: ri.amountGrams
	}))
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
	const macros = calculateSlotMacros(portionMacros, slot.portions)

	function updatePortions(newPortions: number) {
		if (newPortions < 0.5) return
		updateMutation.mutate({ slotId: slot.id, portions: newPortions })
	}

	return (
		<div className="relative rounded-[--radius-md] border border-edge bg-surface-1 p-2">
			<div className="flex items-start justify-between gap-1">
				<span className="line-clamp-2 font-medium text-ink text-sm leading-tight">
					{slot.inventory.recipe.name}
				</span>
				<button
					type="button"
					onClick={() => setShowPopover(true)}
					className="shrink-0 cursor-pointer rounded-[--radius-sm] p-0.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
				>
					<MoreVertical className="size-4" />
				</button>
			</div>

			{/* Inline portion controls */}
			<div className="mt-1 flex items-center gap-1">
				<button
					type="button"
					onClick={() => updatePortions(slot.portions - 0.5)}
					disabled={slot.portions <= 0.5 || updateMutation.isPending}
					className="cursor-pointer rounded-[--radius-sm] p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
				>
					<Minus className="size-3" />
				</button>
				<span className="min-w-8 text-center font-mono text-ink-muted text-xs tabular-nums">
					{slot.portions}
				</span>
				<button
					type="button"
					onClick={() => updatePortions(slot.portions + 0.5)}
					disabled={updateMutation.isPending}
					className="cursor-pointer rounded-[--radius-sm] p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
				>
					<Plus className="size-3" />
				</button>
			</div>

			<div className="mt-1.5 flex items-center gap-3 font-mono text-xs tabular-nums">
				<span className="text-macro-protein">P {macros.protein.toFixed(0)}g</span>
				<span className="text-macro-carbs">C {macros.carbs.toFixed(0)}g</span>
				<span className="text-macro-fat">F {macros.fat.toFixed(0)}g</span>
			</div>
			<div className="mt-1 font-bold font-mono text-macro-kcal text-sm tabular-nums">
				{macros.kcal.toFixed(0)} kcal
			</div>
			<div className="mt-1.5">
				<MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />
			</div>

			{showPopover && <MealPopover slot={slot} inventory={inventory} onClose={() => setShowPopover(false)} />}
		</div>
	)
}
