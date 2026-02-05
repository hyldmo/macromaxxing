import type { FC } from 'react'
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
	return (
		<div className="space-y-2">
			{!readOnly && <IngredientSearchInput recipeId={recipeId} />}
			<div className="overflow-x-auto rounded-[--radius-md] border border-edge">
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
						{recipeIngredients.length === 0 && (
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
