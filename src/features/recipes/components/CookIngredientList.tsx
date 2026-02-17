import { Check } from 'lucide-react'
import { type FC, useState } from 'react'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { formatAmount, formatIngredientAmount } from '../utils/format'

type RecipeIngredient = RouterOutput['recipe']['get']['recipeIngredients'][number]

export interface CookIngredientListProps {
	ingredients: RecipeIngredient[]
	batchSize: number
}

function formatScaledAmount(ri: RecipeIngredient, batchSize: number): string {
	if (ri.subrecipe) {
		const portions = (ri.displayAmount ?? 1) * batchSize
		return `${formatAmount(portions)} ${portions === 1 ? 'portion' : 'portions'}`
	}
	if (ri.displayUnit && ri.displayAmount) {
		const scaled = ri.displayAmount * batchSize
		const gramsScaled = Math.round(ri.amountGrams * batchSize)
		return `${formatIngredientAmount(scaled, ri.displayUnit)} (${gramsScaled}g)`
	}
	return `${Math.round(ri.amountGrams * batchSize)}g`
}

export const CookIngredientList: FC<CookIngredientListProps> = ({ ingredients, batchSize }) => {
	const [checked, setChecked] = useState<Set<string>>(new Set())

	const toggle = (id: string) => {
		setChecked(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<div>
			<h3 className="mb-2 px-1 font-semibold text-ink-muted text-xs uppercase tracking-wider">Ingredients</h3>
			<div className="space-y-1">
				{ingredients.map(ri => {
					const isChecked = checked.has(ri.id)
					const name = ri.subrecipe?.name ?? ri.ingredient?.name ?? ''
					const preparation = ri.preparation ? `, ${ri.preparation}` : ''
					return (
						<button
							key={ri.id}
							type="button"
							onClick={() => toggle(ri.id)}
							className={cn(
								'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors',
								isChecked ? 'bg-surface-2/50 opacity-50' : 'hover:bg-surface-2/50'
							)}
						>
							<div
								className={cn(
									'flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors',
									isChecked ? 'border-accent bg-accent' : 'border-edge bg-surface-1'
								)}
							>
								{isChecked && <Check className="size-3.5 text-surface-0" />}
							</div>
							<span className={cn('flex-1 text-sm', isChecked && 'line-through')}>
								<span className="font-medium text-ink">{name}</span>
								{preparation && <span className="text-ink-faint">{preparation}</span>}
							</span>
							<span
								className={cn(
									'shrink-0 font-mono text-ink-muted text-sm tabular-nums',
									isChecked && 'line-through'
								)}
							>
								{formatScaledAmount(ri, batchSize)}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}
