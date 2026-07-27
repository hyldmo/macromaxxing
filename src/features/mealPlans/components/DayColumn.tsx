import type { MealPlan } from '@macromaxxing/db'
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
import type { RouterOutput } from '~/lib/trpc'
import { DayTotals } from './DayTotals'
import { MealSlot } from './MealSlot'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type SlotWithInventory = InventoryItem['slots'][number] & { inventory: InventoryItem }

export interface DayColumnProps {
	planId: MealPlan['id']
	dayName: string
	dayOfWeek: number
	slots: SlotWithInventory[]
	inventory: InventoryItem[]
	onDrop: (slotIndex: number, inventoryId: InventoryItem['id'], sourceSlotId?: SlotWithInventory['id']) => void
}

const MIN_SLOTS = 3

export const DayColumn: FC<DayColumnProps> = ({ planId, dayName, dayOfWeek, slots, inventory, onDrop }) => {
	// Group by index rather than indexing into a sparse array: `slotIndex` is a position, and a day
	// can still hold rows that share one (older data, or a race). Bucketing keeps the gaps that
	// give a day its breakfast/lunch/dinner shape while rendering every allocated meal.
	const slotsByIndex = new Map<number, SlotWithInventory[]>()
	for (const slot of slots) {
		const bucket = slotsByIndex.get(slot.slotIndex)
		if (bucket) bucket.push(slot)
		else slotsByIndex.set(slot.slotIndex, [slot])
	}

	const maxUsedSlot = slots.length > 0 ? Math.max(...slots.map(s => s.slotIndex)) : -1
	const numSlots = Math.max(MIN_SLOTS, maxUsedSlot + 2) // +2 to always show an empty slot after last used
	const slotGroups = Array.from({ length: numSlots }, (_, index) => ({
		index,
		slots: (slotsByIndex.get(index) ?? []).toSorted((a, b) => a.createdAt - b.createdAt)
	}))

	// Totals come from the slots themselves, so the column footer can't disagree with what's rendered
	const dayTotal = calculateDayTotals(
		slots.map(slot => {
			const recipe = slot.inventory.recipe
			const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
			const totals = calculateRecipeTotals(items)
			const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
			const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
			return calculateSlotMacros(portionMacros, slot.portions)
		})
	)

	return (
		<div className="flex flex-col">
			{/* Day header */}
			<div className="mb-1 text-center font-medium text-ink-muted text-xs">{dayName}</div>

			{/* Meal slots */}
			<div className="flex flex-1 flex-col gap-1">
				{slotGroups.flatMap(({ index, slots: group }) =>
					group.length === 0
						? [
								<MealSlot
									key={`empty-${dayOfWeek}-${index}`}
									planId={planId}
									dayOfWeek={dayOfWeek}
									slotIndex={index}
									slot={null}
									inventory={inventory}
									onDrop={(inventoryId, sourceSlotId) => onDrop(index, inventoryId, sourceSlotId)}
								/>
							]
						: group.map(slot => (
								<MealSlot
									key={slot.id}
									planId={planId}
									dayOfWeek={dayOfWeek}
									slotIndex={index}
									slot={slot}
									inventory={inventory}
									onDrop={(inventoryId, sourceSlotId) => onDrop(index, inventoryId, sourceSlotId)}
								/>
							))
				)}
			</div>

			{/* Day totals */}
			<DayTotals totals={dayTotal} />
		</div>
	)
}
