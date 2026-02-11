import { X } from 'lucide-react'
import type { FC } from 'react'
import { Spinner, TRPCError } from '~/components/ui'
import {
	calculatePortionMacros,
	calculateRecipeTotals,
	getEffectiveCookedWeight,
	type IngredientWithAmount,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]

export interface SlotPickerPopoverProps {
	dayOfWeek: number
	slotIndex: number
	inventory: InventoryItem[]
	onClose: () => void
}

export const SlotPickerPopover: FC<SlotPickerPopoverProps> = ({ dayOfWeek, slotIndex, inventory, onClose }) => {
	const utils = trpc.useUtils()

	const allocateMutation = trpc.mealPlan.allocate.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate()
			onClose()
		}
	})

	function handleSelect(inv: InventoryItem) {
		allocateMutation.mutate({
			inventoryId: inv.id,
			dayOfWeek,
			slotIndex,
			portions: 1
		})
	}

	function getPortionMacros(inv: InventoryItem) {
		const items: IngredientWithAmount[] = inv.recipe.recipeIngredients.map(toIngredientWithAmount)
		const totals = calculateRecipeTotals(items)
		const cookedWeight = getEffectiveCookedWeight(totals.weight, inv.recipe.cookedWeight)
		return calculatePortionMacros(totals, cookedWeight, inv.recipe.portionSize)
	}

	return (
		<div
			className="fixed inset-0 z-50"
			onClick={onClose}
			onKeyDown={e => e.key === 'Escape' && onClose()}
			role="dialog"
			aria-modal="true"
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation for modal */}
			<div
				role="document"
				className="absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-md border border-edge bg-surface-0 shadow-lg"
				onClick={e => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-edge border-b px-3 py-2">
					<span className="font-medium text-ink text-sm">Add meal</span>
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<X className="size-4" />
					</button>
				</div>

				{/* Content */}
				<div className="max-h-64 overflow-y-auto p-2">
					{inventory.length === 0 && (
						<div className="py-4 text-center text-ink-faint text-sm">
							Add recipes to your inventory first
						</div>
					)}
					{inventory.map(inv => {
						const macros = getPortionMacros(inv)
						return (
							<button
								key={inv.id}
								type="button"
								onClick={() => handleSelect(inv)}
								disabled={allocateMutation.isPending}
								className="flex w-full flex-col gap-0.5 rounded-sm p-2 text-left transition-colors hover:bg-surface-2"
							>
								<span className="truncate font-medium text-ink text-sm">{inv.recipe.name}</span>
								<div className="flex items-center gap-2 font-mono text-ink-muted text-xs">
									<span className="text-macro-protein">P{macros.protein.toFixed(0)}</span>
									<span className="text-macro-carbs">C{macros.carbs.toFixed(0)}</span>
									<span className="text-macro-fat">F{macros.fat.toFixed(0)}</span>
									<span className="text-macro-kcal">{macros.kcal.toFixed(0)}</span>
								</div>
							</button>
						)
					})}
					{allocateMutation.isPending && (
						<div className="flex justify-center py-2">
							<Spinner />
						</div>
					)}
					{allocateMutation.error && <TRPCError error={allocateMutation.error} className="mt-2" />}
				</div>
			</div>
		</div>
	)
}
