import type { FC } from 'react'
import type { RouterOutput } from '~/lib/trpc'
import { calculateIngredientMacros } from '../utils/macros'
import { MacroCell } from './MacroCell'

type SubrecipeRI = NonNullable<
	RouterOutput['recipe']['get']['recipeIngredients'][number]['subrecipe']
>['recipeIngredients'][number]

export interface SubrecipeExpandedRowsProps {
	subrecipeIngredients: SubrecipeRI[]
	scaleFactor: number
	readOnly?: boolean
}

export const SubrecipeExpandedRows: FC<SubrecipeExpandedRowsProps> = ({
	subrecipeIngredients,
	scaleFactor,
	readOnly
}) => (
	<tbody>
		{subrecipeIngredients.map((ri, i) => {
			if (!ri.ingredient) return null
			const scaledGrams = ri.amountGrams * scaleFactor
			const macros = calculateIngredientMacros(ri.ingredient, scaledGrams)
			const isLast = i === subrecipeIngredients.length - 1
			return (
				<tr key={ri.id} className="border-edge/30 border-b bg-surface-2/30">
					<td className="px-2 py-1 text-sm">
						<div className="flex items-baseline gap-1 pl-8 text-ink-muted">
							<span className="text-ink-faint">{isLast ? '└─' : '├─'}</span>
							<span>{ri.ingredient.name}</span>
						</div>
					</td>
					<td className="px-2 py-1">
						<span className="font-mono text-ink-muted text-sm">{Math.round(scaledGrams)}g</span>
					</td>
					<MacroCell grams={macros.protein} weight={macros.weight} macro="protein" />
					<MacroCell grams={macros.carbs} weight={macros.weight} macro="carbs" />
					<MacroCell grams={macros.fat} weight={macros.weight} macro="fat" />
					<MacroCell grams={macros.kcal} macro="kcal" />
					{!readOnly && <td />}
				</tr>
			)
		})}
	</tbody>
)
