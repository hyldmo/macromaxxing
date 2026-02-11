import { type FC, useCallback, useEffect, useState } from 'react'
import { Spinner } from '~/components/ui/Spinner'
import type { RouterOutput } from '~/lib/trpc'
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
					<tbody>
						{recipeIngredients.map((ri, i) => (
							<RecipeIngredientRow
								key={ri.id}
								ri={ri}
								macros={ingredientMacros[i]}
								recipeId={recipeId}
								readOnly={readOnly}
							/>
						))}
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
						{recipeIngredients.length === 0 && pendingIngredients.length === 0 && (
							<tr>
								<td colSpan={readOnly ? 6 : 7} className="px-2 py-8 text-center text-ink-faint text-sm">
									{readOnly
										? 'No ingredients in this recipe.'
										: 'No ingredients yet. Search above to add some.'}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	)
}
