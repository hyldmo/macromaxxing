import { Copy, RefreshCw, Trash2, X } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { cn } from '~/lib/cn'
import { type RouterOutput, trpc } from '~/lib/trpc'

type InventoryItem = RouterOutput['mealPlan']['get']['inventory'][number]
type SlotWithInventory = InventoryItem['slots'][number] & { inventory: InventoryItem }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface MealPopoverProps {
	slot: SlotWithInventory
	inventory: InventoryItem[]
	onClose: () => void
}

export const MealPopover: FC<MealPopoverProps> = ({ slot, inventory, onClose }) => {
	const [showCopy, setShowCopy] = useState(false)
	const [showSwap, setShowSwap] = useState(false)
	const [selectedDays, setSelectedDays] = useState<number[]>([])

	const utils = trpc.useUtils()

	const updateMutation = trpc.mealPlan.updateSlot.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate()
			onClose()
		}
	})

	const removeMutation = trpc.mealPlan.removeSlot.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate()
			onClose()
		}
	})

	const copyMutation = trpc.mealPlan.copySlot.useMutation({
		onSuccess: () => {
			utils.mealPlan.get.invalidate()
			onClose()
		}
	})

	const recipe = slot.inventory.recipe

	function handleSwap(inventoryId: string) {
		updateMutation.mutate({
			slotId: slot.id,
			inventoryId: inventoryId as Parameters<typeof updateMutation.mutate>[0]['inventoryId']
		})
	}

	function handleCopy() {
		if (selectedDays.length === 0) return
		copyMutation.mutate({
			slotId: slot.id,
			targetDays: selectedDays,
			targetSlotIndex: slot.slotIndex
		})
	}

	function toggleDay(day: number) {
		setSelectedDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
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
				className="absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-[--radius-md] border border-edge bg-surface-0 shadow-lg"
				onClick={e => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-edge border-b px-3 py-2">
					<span className="truncate font-medium text-ink text-sm">{recipe.name}</span>
					<button
						type="button"
						onClick={onClose}
						className="rounded-[--radius-sm] p-0.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<X className="size-4" />
					</button>
				</div>

				{/* Content */}
				<div className="p-3">
					{!(showCopy || showSwap) && (
						<div className="flex flex-wrap gap-1">
							<Button size="sm" variant="ghost" onClick={() => setShowCopy(true)}>
								<Copy className="size-4" />
								Copy to...
							</Button>
							<Button size="sm" variant="ghost" onClick={() => setShowSwap(true)}>
								<RefreshCw className="size-4" />
								Swap
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => removeMutation.mutate({ slotId: slot.id })}
								disabled={removeMutation.isPending}
								className="text-destructive hover:text-destructive"
							>
								<Trash2 className="size-4" />
								Remove
							</Button>
						</div>
					)}

					{/* Copy to days */}
					{showCopy && (
						<>
							<div className="mb-2 text-ink-muted text-xs">Copy to days:</div>
							<div className="mb-3 flex flex-wrap gap-1">
								{DAYS.map((day, i) => (
									<button
										key={day}
										type="button"
										onClick={() => toggleDay(i)}
										disabled={i === slot.dayOfWeek}
										className={cn(
											'rounded-[--radius-sm] px-2 py-1 text-xs transition-colors',
											i === slot.dayOfWeek
												? 'cursor-not-allowed bg-surface-2 text-ink-faint'
												: selectedDays.includes(i)
													? 'bg-accent text-white'
													: 'bg-surface-1 text-ink hover:bg-surface-2'
										)}
									>
										{day}
									</button>
								))}
							</div>
							<div className="flex gap-1">
								<Button
									size="sm"
									onClick={handleCopy}
									disabled={selectedDays.length === 0 || copyMutation.isPending}
								>
									{copyMutation.isPending ? <Spinner className="size-4" /> : 'Copy'}
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setShowCopy(false)}>
									Back
								</Button>
							</div>
						</>
					)}

					{/* Swap recipe */}
					{showSwap && (
						<>
							<div className="mb-2 text-ink-muted text-xs">Swap with:</div>
							<div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
								{inventory
									.filter(inv => inv.id !== slot.inventoryId)
									.map(inv => (
										<button
											key={inv.id}
											type="button"
											onClick={() => handleSwap(inv.id)}
											className="flex w-full items-center gap-2 rounded-[--radius-sm] p-2 text-left transition-colors hover:bg-surface-2"
										>
											<span className="truncate text-ink text-sm">{inv.recipe.name}</span>
										</button>
									))}
								{inventory.filter(inv => inv.id !== slot.inventoryId).length === 0 && (
									<div className="py-2 text-center text-ink-faint text-xs">
										No other recipes in inventory
									</div>
								)}
							</div>
							<Button size="sm" variant="ghost" onClick={() => setShowSwap(false)}>
								Back
							</Button>
						</>
					)}

					{(updateMutation.error || removeMutation.error || copyMutation.error) && (
						<TRPCError
							error={updateMutation.error || removeMutation.error || copyMutation.error}
							className="mt-2"
						/>
					)}
				</div>
			</div>
		</div>
	)
}
