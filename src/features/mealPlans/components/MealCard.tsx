import { ChevronRight, Minus, Plus } from 'lucide-react'
import { type FC, useRef, useState } from 'react'
import { Card } from '~/components/ui'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
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
	const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
	const totals = calculateRecipeTotals(items)
	const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
	const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
	const macros = calculateSlotMacros(portionMacros, slot.portions)

	function updatePortions(newPortions: number) {
		if (newPortions < 0.5) return
		updateMutation.mutate({ slotId: slot.id, portions: newPortions })
	}

	const cardRef = useRef<HTMLDivElement>(null)

	function handleDragStart(e: React.DragEvent) {
		e.dataTransfer.setData('text/plain', JSON.stringify({ inventoryId: slot.inventoryId, slotId: slot.id }))
		e.dataTransfer.effectAllowed = 'move'
		if (cardRef.current) {
			const rect = cardRef.current.getBoundingClientRect()
			const offsetX = e.clientX - rect.left
			const offsetY = e.clientY - rect.top
			e.dataTransfer.setDragImage(cardRef.current, offsetX, offsetY)
		}
	}

	return (
		<div
			ref={cardRef}
			role="group"
			aria-label={`Meal: ${slot.inventory.recipe.name}`}
			className="group/card relative cursor-grab active:cursor-grabbing"
			draggable
			onDragStart={handleDragStart}
		>
			{/* Card — tappable to open popover, entire card is drag handle */}
			<Card className="cursor-pointer p-2" onClick={() => setShowPopover(true)}>
				<span className="line-clamp-2 font-medium text-ink text-sm leading-tight">
					{slot.inventory.recipe.name}
				</span>
				{recipe.portionSize != null && (
					<div className="mt-1 flex items-center gap-1">
						<button
							type="button"
							onClick={e => {
								e.stopPropagation()
								updatePortions(slot.portions - 0.5)
							}}
							disabled={slot.portions <= 0.5 || updateMutation.isPending}
							className="cursor-pointer rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
						>
							<Minus className="size-3" />
						</button>
						<span className="min-w-8 text-center font-mono text-ink-muted text-xs tabular-nums">
							{slot.portions}
						</span>
						<button
							type="button"
							onClick={e => {
								e.stopPropagation()
								updatePortions(slot.portions + 0.5)
							}}
							disabled={updateMutation.isPending}
							className="cursor-pointer rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
						>
							<Plus className="size-3" />
						</button>
					</div>
				)}
				<div className="mt-1.5 flex items-center gap-3 font-mono text-xs tabular-nums">
					<span className="text-macro-protein">P {macros.protein.toFixed(0)}g</span>
					<span className="text-macro-carbs">C {macros.carbs.toFixed(0)}g</span>
					<span className="text-macro-fat">F {macros.fat.toFixed(0)}g</span>
				</div>
				<div className="mt-1 font-bold font-mono text-macro-kcal text-sm tabular-nums">
					{macros.kcal.toFixed(0)} kcal
				</div>
				<div className="mt-1.5">
					<MacroBar macros={macros} />
				</div>
			</Card>

			<button
				type="button"
				onClick={() => setShowPopover(true)}
				className="absolute top-0 left-[calc(100%-1px)] z-10 hidden items-center rounded-r-md border border-edge border-l-0 bg-surface-1 px-1 py-2 text-ink-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover/card:opacity-100 md:flex"
			>
				<ChevronRight className="size-4" />
			</button>

			{showPopover && (
				<MealPopover
					slot={slot}
					inventory={inventory}
					anchorRef={cardRef}
					onClose={() => setShowPopover(false)}
				/>
			)}
		</div>
	)
}
