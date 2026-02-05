import { Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { TRPCError } from '~/components/ui/TRPCError'
import { type RouterOutput, trpc } from '~/lib/trpc'
import type { AbsoluteMacros } from '../utils/macros'
import { MacroBar } from './MacroBar'
import { MacroCell } from './MacroCell'

export interface RecipeIngredientRowProps {
	ri: RouterOutput['recipe']['get']['recipeIngredients'][number]
	macros: AbsoluteMacros
	recipeId: RouterOutput['recipe']['get']['id']
	readOnly?: boolean
}

export const RecipeIngredientRow: FC<RecipeIngredientRowProps> = ({ ri, macros, recipeId, readOnly }) => {
	const [amount, setAmount] = useState(ri.amountGrams.toString())
	const utils = trpc.useUtils()

	const updateMutation = trpc.recipe.updateIngredient.useMutation({
		onSuccess: () => utils.recipe.getPublic.invalidate({ id: recipeId })
	})
	const removeMutation = trpc.recipe.removeIngredient.useMutation({
		onSuccess: () => utils.recipe.getPublic.invalidate({ id: recipeId })
	})

	const error = updateMutation.error || removeMutation.error

	function handleAmountBlur() {
		if (readOnly) return
		const parsed = Number.parseFloat(amount)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setAmount(ri.amountGrams.toString())
			return
		}
		if (parsed !== ri.amountGrams) {
			updateMutation.mutate({ id: ri.id, amountGrams: parsed })
		}
	}

	return (
		<>
			<tr className="border-edge/50 border-b transition-colors hover:bg-surface-2/50">
				<td className="px-2 py-1.5 font-medium text-ink text-sm">{ri.ingredient.name}</td>
				<td className="px-2 py-1.5">
					{readOnly ? (
						<span className="font-mono text-ink-muted text-sm">{ri.amountGrams}</span>
					) : (
						<Input
							type="number"
							className="h-7 w-20 text-right font-mono text-sm"
							value={amount}
							onChange={e => setAmount(e.target.value)}
							onBlur={handleAmountBlur}
							min={0}
						/>
					)}
				</td>
				<MacroCell grams={macros.protein} weight={macros.weight} macro="protein" />
				<MacroCell grams={macros.carbs} weight={macros.weight} macro="carbs" />
				<MacroCell grams={macros.fat} weight={macros.weight} macro="fat" />
				<MacroCell grams={macros.kcal} weight={macros.weight} macro="kcal" />
				{!readOnly && (
					<td className="px-1 py-1.5">
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => removeMutation.mutate({ id: ri.id })}
						>
							<Trash2 className="h-3.5 w-3.5 text-ink-faint" />
						</Button>
					</td>
				)}
			</tr>
			<tr className="border-edge/30 border-b">
				<td colSpan={readOnly ? 6 : 7} className="px-2 pb-1.5">
					<MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} />
					{error && <TRPCError error={error} className="mt-1" />}
				</td>
			</tr>
		</>
	)
}
