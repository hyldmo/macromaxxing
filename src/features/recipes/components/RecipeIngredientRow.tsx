import { Trash2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { Select } from '~/components/ui/Select'
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
	const units = ri.ingredient.units ?? []
	const hasUnits = units.length > 0

	// Determine initial display state
	const initialUnit = ri.displayUnit ?? 'g'
	const initialAmount = ri.displayAmount ?? ri.amountGrams

	const [displayAmount, setDisplayAmount] = useState(initialAmount.toString())
	const [displayUnit, setDisplayUnit] = useState(initialUnit)
	const utils = trpc.useUtils()

	// Update local state when ri changes (e.g., after mutation)
	useEffect(() => {
		setDisplayAmount((ri.displayAmount ?? ri.amountGrams).toString())
		setDisplayUnit(ri.displayUnit ?? 'g')
	}, [ri.displayAmount, ri.displayUnit, ri.amountGrams])

	const updateMutation = trpc.recipe.updateIngredient.useMutation({
		onSuccess: () => utils.recipe.getPublic.invalidate({ id: recipeId })
	})
	const removeMutation = trpc.recipe.removeIngredient.useMutation({
		onSuccess: () => utils.recipe.getPublic.invalidate({ id: recipeId })
	})

	const error = updateMutation.error || removeMutation.error

	function getGramsPerUnit(unitName: string): number {
		if (unitName === 'g') return 1
		const unit = units.find(u => u.name === unitName)
		return unit?.grams ?? 1
	}

	function handleAmountBlur() {
		if (readOnly) return
		const parsed = Number.parseFloat(displayAmount)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setDisplayAmount((ri.displayAmount ?? ri.amountGrams).toString())
			return
		}

		const gramsPerUnit = getGramsPerUnit(displayUnit)
		const newAmountGrams = parsed * gramsPerUnit

		if (newAmountGrams !== ri.amountGrams || displayUnit !== (ri.displayUnit ?? 'g')) {
			updateMutation.mutate({
				id: ri.id,
				amountGrams: newAmountGrams,
				displayUnit: displayUnit === 'g' ? null : displayUnit,
				displayAmount: displayUnit === 'g' ? null : parsed
			})
		}
	}

	function handleUnitChange(newUnit: string) {
		if (readOnly) return
		const currentAmount = Number.parseFloat(displayAmount) || 0
		const currentGramsPerUnit = getGramsPerUnit(displayUnit)
		const currentGrams = currentAmount * currentGramsPerUnit

		const newGramsPerUnit = getGramsPerUnit(newUnit)
		const newAmount = currentGrams / newGramsPerUnit

		setDisplayUnit(newUnit)
		setDisplayAmount(newAmount.toFixed(newUnit === 'g' ? 0 : 1))

		updateMutation.mutate({
			id: ri.id,
			amountGrams: currentGrams,
			displayUnit: newUnit === 'g' ? null : newUnit,
			displayAmount: newUnit === 'g' ? null : newAmount
		})
	}

	// Format display for read-only mode
	const formatReadOnlyDisplay = () => {
		if (ri.displayUnit && ri.displayAmount) {
			return (
				<span className="font-mono text-ink-muted text-sm">
					{ri.displayAmount} {ri.displayUnit}{' '}
					<span className="text-ink-faint">({Math.round(ri.amountGrams)}g)</span>
				</span>
			)
		}
		return <span className="font-mono text-ink-muted text-sm">{ri.amountGrams}g</span>
	}

	return (
		<>
			<tr className="border-edge/50 border-b transition-colors hover:bg-surface-2/50">
				<td className="px-2 py-1.5 font-medium text-ink text-sm">{ri.ingredient.name}</td>
				<td className="px-2 py-1.5">
					{readOnly ? (
						formatReadOnlyDisplay()
					) : (
						<div className="flex items-center gap-1">
							<Input
								type="number"
								className="h-7 w-16 text-right font-mono text-sm"
								value={displayAmount}
								onChange={e => setDisplayAmount(e.target.value)}
								onBlur={handleAmountBlur}
								min={0}
								step={displayUnit === 'g' ? 1 : 0.1}
							/>
							{hasUnits ? (
								<Select
									className="h-7 w-20 font-mono text-sm"
									value={displayUnit}
									onChange={e => handleUnitChange(e.target.value)}
								>
									<option value="g">g</option>
									{units
										.filter(unit => unit.name !== 'g')
										.map(unit => (
											<option key={unit.id} value={unit.name}>
												{unit.name}
											</option>
										))}
								</Select>
							) : (
								<span className="text-ink-muted text-sm">g</span>
							)}
							{displayUnit !== 'g' && (
								<span className="text-ink-faint text-xs">({Math.round(ri.amountGrams)}g)</span>
							)}
						</div>
					)}
				</td>
				<MacroCell grams={macros.protein} weight={macros.weight} macro="protein" />
				<MacroCell grams={macros.carbs} weight={macros.weight} macro="carbs" />
				<MacroCell grams={macros.fat} weight={macros.weight} macro="fat" />
				<MacroCell grams={macros.kcal} macro="kcal" />
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
