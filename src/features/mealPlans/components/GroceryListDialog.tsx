import { Check, ClipboardCopy, X } from 'lucide-react'
import { type FC, useCallback, useMemo, useState } from 'react'
import { Button, Modal } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'
import { formatGroceryList, type GroceryItem, generateGroceryList } from '../utils/grocery'

type MealPlan = RouterOutput['mealPlan']['get']

export interface GroceryListDialogProps {
	plan: MealPlan
	onClose: () => void
}

export const GroceryListDialog: FC<GroceryListDialogProps> = ({ plan, onClose }) => {
	const items = useMemo(() => generateGroceryList(plan), [plan])
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(formatGroceryList(items))
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}, [items])

	return (
		<Modal onClose={onClose} className="w-full max-w-md">
			{/* Header */}
			<div className="flex items-center justify-between border-edge border-b px-4 py-3">
				<h2 className="font-semibold text-ink">Grocery List</h2>
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="sm" onClick={handleCopy}>
						{copied ? <Check className="size-4 text-success" /> : <ClipboardCopy className="size-4" />}
						{copied ? 'Copied' : 'Copy'}
					</Button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<X className="size-5" />
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="max-h-[70vh] overflow-y-auto p-4">
				{items.length === 0 ? (
					<div className="py-4 text-center text-ink-faint text-sm">No ingredients in this meal plan.</div>
				) : (
					<div className="space-y-1">
						{items.map(item => (
							<GroceryRow key={item.ingredient.id} item={item} />
						))}
					</div>
				)}
			</div>

			{/* Footer */}
			{items.length > 0 && (
				<div className="border-edge border-t px-4 py-3 text-ink-muted text-xs">
					{items.length} ingredient{items.length !== 1 && 's'} across {plan.inventory.length} recipe
					{plan.inventory.length !== 1 && 's'}
				</div>
			)}
		</Modal>
	)
}

const GroceryRow: FC<{ item: GroceryItem }> = ({ item }) => {
	const grams = Math.round(item.totalGrams)

	return (
		<div className="flex items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-surface-2">
			<div className="min-w-0">
				<span className="text-ink text-sm">{item.ingredient.name}</span>
				{item.sources.length > 1 && (
					<span className="ml-1.5 text-ink-faint text-xs">
						({item.sources.map(s => s.recipeName).join(', ')})
					</span>
				)}
			</div>
			<span className="shrink-0 font-mono text-ink-muted text-sm tabular-nums">{formatGrams(grams)}</span>
		</div>
	)
}

function formatGrams(grams: number): string {
	if (grams >= 1000) {
		const kg = grams / 1000
		return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`
	}
	return `${grams}g`
}
