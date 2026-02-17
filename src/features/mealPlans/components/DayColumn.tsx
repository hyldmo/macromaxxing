import type { FC } from 'react'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import type { MacroTargets } from '~/lib/macros'
import type { RouterOutput } from '~/lib/trpc'
import { DayTotals } from './DayTotals'
import { MealSlot } from './MealSlot'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type SlotWithInventory = InventoryItem['slots'][number] & { inventory: InventoryItem }

export interface DayColumnProps {
	dayName: string
	dayOfWeek: number
	slots: SlotWithInventory[]
	inventory: InventoryItem[]
	onDrop: (slotIndex: number, inventoryId: string, sourceSlotId?: string) => void
	targets?: MacroTargets | null
}

const MIN_SLOTS = 3

export const DayColumn: FC<DayColumnProps> = ({ dayName, dayOfWeek, slots, inventory, onDrop, targets }) => {
	// Sort slots by index
	const sortedSlots = slots.toSorted((a, b) => a.slotIndex - b.slotIndex)

	// Calculate the max slot index we need to show
	const maxUsedSlot = sortedSlots.length > 0 ? Math.max(...sortedSlots.map(s => s.slotIndex)) : -1
	const numSlots = Math.max(MIN_SLOTS, maxUsedSlot + 2) // +2 to always show an empty slot after last used

	// Create slot array with gaps
	const slotArray: (SlotWithInventory | null)[] = Array(numSlots).fill(null)
	for (const slot of sortedSlots) {
		slotArray[slot.slotIndex] = slot
	}

	// Calculate macros for each slot
	const slotMacros = slotArray.map(slot => {
		if (!slot) return null
		const recipe = slot.inventory.recipe
		const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
		const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
		return calculateSlotMacros(portionMacros, slot.portions)
	})

	// Calculate day totals
	const dayTotal = calculateDayTotals(slotMacros.filter(Boolean) as NonNullable<(typeof slotMacros)[number]>[])

	return (
		<div className="flex flex-col">
			{/* Day header */}
			<div className="mb-1 text-center font-medium text-ink-muted text-xs">{dayName}</div>

			{/* Meal slots */}
			<div className="flex flex-1 flex-col gap-1">
				{slotArray.map((slot, index) => (
					<MealSlot
						key={slot?.id ?? `empty-${dayOfWeek}-${index}`}
						dayOfWeek={dayOfWeek}
						slotIndex={index}
						slot={slot}
						inventory={inventory}
						onDrop={(inventoryId, sourceSlotId) => onDrop(index, inventoryId, sourceSlotId)}
					/>
				))}
			</div>

			{/* Day totals */}
			<DayTotals totals={dayTotal} targets={targets} />
		</div>
	)
}
