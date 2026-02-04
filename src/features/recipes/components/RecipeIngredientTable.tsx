import type { AbsoluteMacros } from '../utils/macros'
import { IngredientSearchInput } from './IngredientSearchInput'
import { MacroHeader } from './MacroCell'
import { RecipeIngredientRow } from './RecipeIngredientRow'
import { RecipeSummaryRow } from './RecipeSummaryRow'

interface RecipeIngredient {
	id: string
	amountGrams: number
	ingredient: {
		id: string
		name: string
		protein: number
		carbs: number
		fat: number
		kcal: number
		fiber: number
	}
}

interface RecipeIngredientTableProps {
	recipeId: string
	recipeIngredients: RecipeIngredient[]
	ingredientMacros: AbsoluteMacros[]
	totals: AbsoluteMacros
	portion: AbsoluteMacros
}

export function RecipeIngredientTable({
	recipeId,
	recipeIngredients,
	ingredientMacros,
	totals,
	portion
}: RecipeIngredientTableProps) {
	return (
		<div className="space-y-2">
			<IngredientSearchInput recipeId={recipeId} />
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
							<MacroHeader macro="fiber" label="Fiber" />
							<th className="w-8" />
						</tr>
					</thead>
					<tbody>
						{recipeIngredients.map((ri, i) => (
							<RecipeIngredientRow key={ri.id} ri={ri} macros={ingredientMacros[i]} recipeId={recipeId} />
						))}
						{recipeIngredients.length === 0 && (
							<tr>
								<td colSpan={8} className="px-2 py-8 text-center text-ink-faint text-sm">
									No ingredients yet. Search above to add some.
								</td>
							</tr>
						)}
					</tbody>
					{recipeIngredients.length > 0 && (
						<tfoot>
							<RecipeSummaryRow
								label="Total"
								macros={totals}
								className="border-edge border-t bg-surface-2/60"
							/>
							<RecipeSummaryRow
								label="Portion"
								macros={portion}
								className="border-edge border-t bg-accent/5"
							/>
						</tfoot>
					)}
				</table>
			</div>
		</div>
	)
}
