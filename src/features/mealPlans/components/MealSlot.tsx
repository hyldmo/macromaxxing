import { Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import { cn } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { MealCard } from './MealCard'
import { SlotPickerPopover } from './SlotPickerPopover'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type SlotWithInventory = InventoryItem['slots'][number] & { inventory: InventoryItem }

export interface MealSlotProps {
	dayOfWeek: number
	slotIndex: number
	slot: SlotWithInventory | null
	inventory: InventoryItem[]
	onDrop: (inventoryId: InventoryItem['id'], sourceSlotId?: SlotWithInventory['id']) => void
}

export const MealSlot: FC<MealSlotProps> = ({ dayOfWeek, slotIndex, slot, inventory, onDrop }) => {
	const [showPicker, setShowPicker] = useState(false)
	const [isDragOver, setIsDragOver] = useState(false)

	if (slot) {
		return <MealCard slot={slot} inventory={inventory} />
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault()
		e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move'
		setIsDragOver(true)
	}

	function handleDragLeave() {
		setIsDragOver(false)
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragOver(false)
		const raw = e.dataTransfer.getData('text/plain')
		if (!raw) return
		try {
			const data: { inventoryId: InventoryItem['id']; slotId?: SlotWithInventory['id'] } = JSON.parse(raw)
			onDrop(data.inventoryId, data.slotId)
		} catch {
			// Plain inventoryId from inventory sidebar drag
			onDrop(raw as InventoryItem['id'])
		}
	}

	return (
		<>
			<div
				role="region"
				aria-label="Empty meal slot"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={cn(
					'flex min-h-16 items-center justify-center rounded-sm border border-dashed transition-colors',
					isDragOver ? 'border-accent bg-accent/10' : 'border-edge hover:border-ink-faint hover:bg-surface-1'
				)}
			>
				<button
					type="button"
					onClick={() => setShowPicker(true)}
					className="flex size-full cursor-pointer items-center justify-center text-ink-faint hover:text-ink-muted"
				>
					<Plus className="size-4" />
				</button>
			</div>

			{showPicker && (
				<SlotPickerPopover
					dayOfWeek={dayOfWeek}
					slotIndex={slotIndex}
					inventory={inventory}
					onClose={() => setShowPicker(false)}
				/>
			)}
		</>
	)
}
