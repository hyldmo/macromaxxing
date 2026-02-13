import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, NumberInput, Select, TRPCError } from '~/components/ui'
import { cn } from '~/lib/cn'
import type { AbsoluteMacros } from '~/lib/macros'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { formatIngredientAmount, getAllUnits } from '../utils/format'
import { MacroBar } from './MacroBar'
import { MacroCell } from './MacroCell'
import { PreparationInput } from './PreparationInput'

export interface RecipeIngredientRowProps {
	ri: RouterOutput['recipe']['get']['recipeIngredients'][number]
	macros: AbsoluteMacros
	recipeId: RouterOutput['recipe']['get']['id']
	readOnly?: boolean
	expanded?: boolean
	onToggleExpand?: () => void
}

export const RecipeIngredientRow: FC<RecipeIngredientRowProps> = ({
	ri,
	macros,
	recipeId,
	readOnly,
	expanded,
	onToggleExpand
}) => {
	const isSubrecipe = ri.subrecipe != null
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ri.id })
	const style = { transform: CSS.Translate.toString(transform), transition }

	const units = isSubrecipe ? [] : getAllUnits(ri.ingredient?.units ?? [], ri.ingredient?.density ?? null)
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
		onSuccess: () => utils.recipe.get.invalidate({ id: recipeId })
	})
	const removeMutation = trpc.recipe.removeIngredient.useMutation({
		onSuccess: () => utils.recipe.get.invalidate({ id: recipeId })
	})

	const error = updateMutation.error || removeMutation.error

	function getGramsPerUnit(unitName: string): number {
		if (unitName === 'g') return 1
		const unit = units.find(u => u.name === unitName)
		return unit?.grams ?? 1
	}

	// For subrecipes: compute effective portion size to convert portions <-> grams
	function getSubrecipePortionSize(): number {
		if (!ri.subrecipe) return 1
		const rawTotal = ri.subrecipe.recipeIngredients.reduce((sum, sri) => sum + sri.amountGrams, 0)
		const cookedWeight = ri.subrecipe.cookedWeight ?? rawTotal
		return ri.subrecipe.portionSize ?? cookedWeight
	}

	function handleAmountBlur() {
		if (readOnly) return
		const parsed = Number.parseFloat(displayAmount)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setDisplayAmount((ri.displayAmount ?? ri.amountGrams).toString())
			return
		}

		if (isSubrecipe) {
			const portionSize = getSubrecipePortionSize()
			const newAmountGrams = parsed * portionSize
			if (newAmountGrams !== ri.amountGrams || parsed !== ri.displayAmount) {
				updateMutation.mutate({
					id: ri.id,
					amountGrams: newAmountGrams,
					displayUnit: 'portions',
					displayAmount: parsed
				})
			}
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
		if (isSubrecipe) {
			const portions = ri.displayAmount ?? 1
			return (
				<span className="font-mono text-ink-muted text-sm">
					{portions} {portions === 1 ? 'portion' : 'portions'}{' '}
					<span className="text-ink-faint">({Math.round(ri.amountGrams)}g)</span>
				</span>
			)
		}
		if (ri.displayUnit && ri.displayAmount) {
			return (
				<span className="font-mono text-ink-muted text-sm">
					{formatIngredientAmount(ri.displayAmount, ri.displayUnit)}{' '}
					<span className="text-ink-faint">({Math.round(ri.amountGrams)}g)</span>
				</span>
			)
		}
		return <span className="font-mono text-ink-muted text-sm">{ri.amountGrams}g</span>
	}

	const itemName = isSubrecipe ? ri.subrecipe!.name : ri.ingredient!.name

	return (
		<tbody ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-50')}>
			<tr className="group border-edge/50 border-b transition-colors hover:bg-surface-2/50">
				<td className="px-2 py-1.5 font-medium text-sm">
					<div className="flex items-baseline gap-1">
						{!(readOnly || isSubrecipe) && (
							<button
								type="button"
								className="shrink-0 cursor-grab touch-none self-center text-ink-faint hover:text-ink active:cursor-grabbing"
								{...attributes}
								{...listeners}
							>
								<GripVertical className="size-3.5" />
							</button>
						)}
						{isSubrecipe && (
							<button
								type="button"
								className="shrink-0 self-center text-ink-faint hover:text-ink"
								onClick={onToggleExpand}
							>
								{expanded ? (
									<ChevronDown className="size-3.5" />
								) : (
									<ChevronRight className="size-3.5" />
								)}
							</button>
						)}
						{isSubrecipe ? (
							<Link to={`/recipes/${ri.subrecipeId}`} className="text-accent hover:underline">
								{itemName}
							</Link>
						) : (
							<span className="text-ink">{itemName}</span>
						)}
						{!isSubrecipe &&
							(readOnly ? (
								ri.preparation && <span className="font-normal text-ink-faint">{ri.preparation}</span>
							) : (
								<PreparationInput
									value={ri.preparation ?? ''}
									onChange={preparation => updateMutation.mutate({ id: ri.id, preparation })}
								/>
							))}
					</div>
				</td>
				<td className="px-2 py-1.5">
					{readOnly ? (
						formatReadOnlyDisplay()
					) : isSubrecipe ? (
						<div className="flex items-center gap-1">
							<NumberInput
								className="h-7 w-20 text-sm"
								value={displayAmount}
								onChange={e => setDisplayAmount(e.target.value)}
								onBlur={handleAmountBlur}
							/>
							<span className="text-ink-muted text-sm">portions</span>
							<span className="text-ink-faint text-xs">({Math.round(ri.amountGrams)}g)</span>
						</div>
					) : (
						<div className="flex items-center gap-1">
							<NumberInput
								className="h-7 w-20 text-sm"
								value={displayAmount}
								onChange={e => setDisplayAmount(e.target.value)}
								onBlur={handleAmountBlur}
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
											<option key={unit.name} value={unit.name}>
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
					<MacroBar macros={macros} />
					{error && <TRPCError error={error} className="mt-1" />}
				</td>
			</tr>
		</tbody>
	)
}
