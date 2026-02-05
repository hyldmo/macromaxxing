import type { MealPlan } from '@macromaxxing/db'
import { Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import type { RouterOutput } from '~/lib/trpc'
import { AddToInventoryModal } from './AddToInventoryModal'
import { InventoryCard } from './InventoryCard'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface InventorySidebarProps {
	planId: MealPlan['id']
	inventory: InventoryItem[]
}

export const InventorySidebar: FC<InventorySidebarProps> = ({ planId, inventory }) => {
	const [showAddModal, setShowAddModal] = useState(false)

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-ink-muted text-xs uppercase tracking-wider">Inventory</h3>
				<Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)}>
					<Plus className="size-4" />
					Add
				</Button>
			</div>

			{inventory.length === 0 && (
				<div className="rounded-[--radius-md] border border-edge border-dashed p-4 text-center text-ink-faint text-sm">
					No recipes added yet. Add recipes to your inventory to start planning.
				</div>
			)}

			<div className="space-y-2">
				{inventory.map(item => (
					<InventoryCard key={item.id} inventory={item} />
				))}
			</div>

			{showAddModal && <AddToInventoryModal planId={planId} onClose={() => setShowAddModal(false)} />}
		</div>
	)
}
