import { type FC, useState } from 'react'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { DayColumn } from './DayColumn'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface WeekGridProps {
	inventory: InventoryItem[]
	onDrop: (dayOfWeek: number, slotIndex: number, inventoryId: string, sourceSlotId?: string) => void
}

/** Map JS getDay() (Sun=0..Sat=6) to our Mon=0..Sun=6 index */
function todayDayIndex() {
	const d = new Date().getDay()
	return d === 0 ? 6 : d - 1
}

export const WeekGrid: FC<WeekGridProps> = ({ inventory, onDrop }) => {
	const [selectedDay, setSelectedDay] = useState(todayDayIndex)

	// Collect all slots from inventory
	const allSlots = inventory.flatMap(inv =>
		inv.slots.map(slot => ({
			...slot,
			inventory: inv
		}))
	)

	// Group by day
	const slotsByDay = DAYS.map((_, dayIndex) => allSlots.filter(s => s.dayOfWeek === dayIndex))

	// Per-day totals for mobile tab indicators
	const dayTotals = DAYS.map((_, dayIndex) => {
		const slotsForDay = inventory.flatMap(inv =>
			inv.slots
				.filter(s => s.dayOfWeek === dayIndex)
				.map(slot => {
					const recipe = inv.recipe
					const items: IngredientWithAmount[] = recipe.recipeIngredients.map(toIngredientWithAmount)
					const totals = calculateRecipeTotals(items)
					const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
					const portionMacros = calculatePortionMacros(totals, cookedWeight, recipe.portionSize)
					return calculateSlotMacros(portionMacros, slot.portions)
				})
		)
		return calculateDayTotals(slotsForDay)
	})

	return (
		<>
			{/* Mobile: day selector tabs + single day column */}
			<div className="md:hidden">
				<div className="mb-2 flex gap-1">
					{DAYS.map((day, dayIndex) => (
						<button
							key={day}
							type="button"
							onClick={() => setSelectedDay(dayIndex)}
							className={cn(
								'flex flex-1 cursor-pointer flex-col items-center rounded-md px-1 py-1.5 text-xs transition-colors',
								selectedDay === dayIndex
									? 'bg-accent text-white'
									: 'bg-surface-1 text-ink-muted hover:bg-surface-2'
							)}
						>
							<span className="font-medium">{day}</span>
							{dayTotals[dayIndex].kcal > 0 && (
								<>
									<span className="font-mono text-[10px] tabular-nums opacity-75">
										{dayTotals[dayIndex].kcal.toFixed(0)}
									</span>
									<span
										className={cn(
											'font-mono text-[10px] tabular-nums',
											selectedDay === dayIndex ? 'opacity-75' : 'text-macro-protein'
										)}
									>
										P{dayTotals[dayIndex].protein.toFixed(0)}
									</span>
								</>
							)}
						</button>
					))}
				</div>
				<DayColumn
					dayName={DAYS[selectedDay]}
					dayOfWeek={selectedDay}
					slots={slotsByDay[selectedDay]}
					inventory={inventory}
					onDrop={(slotIndex, inventoryId, sourceSlotId) =>
						onDrop(selectedDay, slotIndex, inventoryId, sourceSlotId)
					}
				/>
			</div>

			{/* Desktop: 7-column grid */}
			<div className="hidden md:grid md:grid-cols-7 md:gap-1">
				{DAYS.map((day, dayIndex) => (
					<DayColumn
						key={day}
						dayName={day}
						dayOfWeek={dayIndex}
						slots={slotsByDay[dayIndex]}
						inventory={inventory}
						onDrop={(slotIndex, inventoryId, sourceSlotId) =>
							onDrop(dayIndex, slotIndex, inventoryId, sourceSlotId)
						}
					/>
				))}
			</div>
		</>
	)
}
