import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type FC, useCallback, useEffect, useState } from 'react'
import { Spinner } from '~/components/ui'
import { type RouterOutput, trpc } from '~/lib/trpc'
import type { AbsoluteMacros } from '../utils/macros'
import { IngredientSearchInput } from './IngredientSearchInput'
import { MacroHeader } from './MacroCell'
import { RecipeIngredientRow } from './RecipeIngredientRow'

type RecipeIngredient = RouterOutput['recipe']['get']['recipeIngredients'][number]

export interface RecipeIngredientTableProps {
	recipeId: RouterOutput['recipe']['get']['id']
	recipeIngredients: RecipeIngredient[]
	ingredientMacros: AbsoluteMacros[]
	readOnly?: boolean
}

export const RecipeIngredientTable: FC<RecipeIngredientTableProps> = ({
	recipeId,
	recipeIngredients,
	ingredientMacros,
	readOnly
}) => {
	const [pendingIngredients, setPendingIngredients] = useState<string[]>([])
	const utils = trpc.useUtils()
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

	const updateMutation = trpc.recipe.updateIngredient.useMutation({
		onSettled: () => utils.recipe.get.invalidate({ id: recipeId })
	})

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const oldIndex = recipeIngredients.findIndex(ri => ri.id === active.id)
		const newIndex = recipeIngredients.findIndex(ri => ri.id === over.id)
		if (oldIndex === -1 || newIndex === -1) return

		// Optimistic update: reorder in tRPC cache
		utils.recipe.get.setData({ id: recipeId }, prev => {
			if (!prev) return prev
			const reordered = [...prev.recipeIngredients]
			const [moved] = reordered.splice(oldIndex, 1)
			reordered.splice(newIndex, 0, moved)
			return { ...prev, recipeIngredients: reordered.map((ri, i) => ({ ...ri, sortOrder: i })) }
		})

		// Persist new sort orders for all affected items
		const min = Math.min(oldIndex, newIndex)
		const max = Math.max(oldIndex, newIndex)
		const reordered = [...recipeIngredients]
		const [moved] = reordered.splice(oldIndex, 1)
		reordered.splice(newIndex, 0, moved)
		for (let i = min; i <= max; i++) {
			updateMutation.mutate({ id: reordered[i].id, sortOrder: i })
		}
	}

	const addPending = useCallback((name: string) => {
		setPendingIngredients(prev => [...prev, name])
	}, [])

	const removePending = useCallback((name: string) => {
		setPendingIngredients(prev => prev.filter(n => n.toLowerCase() !== name.toLowerCase()))
	}, [])

	// Auto-clear pending ingredients when they appear in real data
	useEffect(() => {
		if (pendingIngredients.length === 0) return
		const currentNames = new Set(recipeIngredients.map(ri => ri.ingredient.name.toLowerCase()))
		setPendingIngredients(prev => prev.filter(name => !currentNames.has(name.toLowerCase())))
	}, [recipeIngredients, pendingIngredients.length])

	return (
		<div className="space-y-2">
			{!readOnly && (
				<IngredientSearchInput recipeId={recipeId} onAddPending={addPending} onRemovePending={removePending} />
			)}
			<div className="overflow-x-auto rounded-md border border-edge">
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={recipeIngredients.map(ri => ri.id)} strategy={verticalListSortingStrategy}>
						<table className="w-full text-sm">
							<thead>
								<tr className="border-edge border-b bg-surface-2/50">
									<th className="px-2 py-1.5 text-left font-medium text-ink-muted text-xs">Item</th>
									<th className="px-2 py-1.5 text-right font-medium text-ink-muted text-xs">g</th>
									<MacroHeader macro="protein" label="Prot" />
									<MacroHeader macro="carbs" label="Carbs" />
									<MacroHeader macro="fat" label="Fat" />
									<MacroHeader macro="kcal" label="Kcal" />
									{!readOnly && <th className="w-8" />}
								</tr>
							</thead>
							{recipeIngredients.map((ri, i) => (
								<RecipeIngredientRow
									key={ri.id}
									ri={ri}
									macros={ingredientMacros[i]}
									recipeId={recipeId}
									readOnly={readOnly}
								/>
							))}
							{pendingIngredients.length > 0 && (
								<tbody>
									{pendingIngredients.map(name => (
										<tr key={`pending-${name}`} className="border-edge/50 border-b">
											<td className="px-2 py-1.5">
												<div className="flex items-center gap-2">
													<Spinner className="size-3" />
													<span className="text-ink-muted text-sm">{name}</span>
												</div>
											</td>
											<td className="px-2 py-1.5 text-right font-mono text-ink-faint text-sm">&mdash;</td>
											<td className="px-2 py-1.5 text-right font-mono text-ink-faint text-sm">&mdash;</td>
											<td className="px-2 py-1.5 text-right font-mono text-ink-faint text-sm">&mdash;</td>
											<td className="px-2 py-1.5 text-right font-mono text-ink-faint text-sm">&mdash;</td>
											<td className="px-2 py-1.5 text-right font-mono text-ink-faint text-sm">&mdash;</td>
											{!readOnly && <td className="w-8" />}
										</tr>
									))}
								</tbody>
							)}
							{recipeIngredients.length === 0 && pendingIngredients.length === 0 && (
								<tbody>
									<tr>
										<td colSpan={readOnly ? 6 : 7} className="px-2 py-8 text-center text-ink-faint text-sm">
											{readOnly
												? 'No ingredients in this recipe.'
												: 'No ingredients yet. Search above to add some.'}
										</td>
									</tr>
								</tbody>
							)}
						</table>
					</SortableContext>
				</DndContext>
			</div>
		</div>
	)
}
