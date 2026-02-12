import type { FC } from 'react'
import type { RouterOutput } from '~/lib/trpc'
import { DayColumn } from './DayColumn'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface WeekGridProps {
	inventory: InventoryItem[]
	onDrop: (dayOfWeek: number, slotIndex: number, inventoryId: string, sourceSlotId?: string) => void
}

export const WeekGrid: FC<WeekGridProps> = ({ inventory, onDrop }) => {
	// Collect all slots from inventory
	const allSlots = inventory.flatMap(inv =>
		inv.slots.map(slot => ({
			...slot,
			inventory: inv
		}))
	)

	// Group by day
	const slotsByDay = DAYS.map((_, dayIndex) => allSlots.filter(s => s.dayOfWeek === dayIndex))

	return (
		<div className="grid grid-cols-7 gap-1">
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
	)
}
