import type { FC } from 'react'
import { Link } from 'react-router-dom'
import type { RouterOutput } from '~/lib/trpc'
import type { AbsoluteMacros } from '../utils/macros'
import { MacroBar } from './MacroBar'
import { MacroRing } from './MacroRing'

type Recipe = RouterOutput['recipe']['list'][number]

export interface RecipeCardProps {
	id: Recipe['id']
	name: Recipe['name']
	ingredientCount: number
	portionSize: Recipe['portionSize']
	portion: AbsoluteMacros
}

export const RecipeCard: FC<RecipeCardProps> = ({ id, name, ingredientCount, portionSize, portion }) => {
	return (
		<Link to={`/recipes/${id}`}>
			<div className="flex items-center gap-4 rounded-[--radius-md] border border-edge bg-surface-1 p-3 transition-colors hover:bg-surface-2">
				<MacroRing
					protein={portion.protein}
					carbs={portion.carbs}
					fat={portion.fat}
					kcal={portion.kcal}
					size="sm"
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline justify-between gap-2">
						<h2 className="truncate font-medium text-ink text-sm">{name}</h2>
						<span className="shrink-0 font-bold font-mono text-lg text-macro-kcal tabular-nums">
							{portion.kcal.toFixed(0)}
							<span className="ml-0.5 font-normal text-ink-muted text-xs">kcal</span>
						</span>
					</div>
					<p className="text-ink-faint text-xs">
						{ingredientCount} items / {portionSize}g portion
					</p>
					<div className="mt-1 flex items-center gap-3 font-mono text-xs">
						<span className="text-macro-protein">P {portion.protein.toFixed(0)}g</span>
						<span className="text-macro-carbs">C {portion.carbs.toFixed(0)}g</span>
						<span className="text-macro-fat">F {portion.fat.toFixed(0)}g</span>
					</div>
					<div className="mt-1.5">
						<MacroBar protein={portion.protein} carbs={portion.carbs} fat={portion.fat} />
					</div>
				</div>
			</div>
		</Link>
	)
}
