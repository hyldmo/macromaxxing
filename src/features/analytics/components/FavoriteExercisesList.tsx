import { startCase } from 'es-toolkit'
import type { FC } from 'react'
import { Link } from 'react-router-dom'
import type { RouterOutput } from '~/lib/trpc'

type Exercise = RouterOutput['workout']['listExercises'][number]

export interface FavoriteExercisesListProps {
	exercises: Exercise[]
}

const TYPE_BADGE = {
	compound: 'bg-macro-protein/20 text-macro-protein',
	isolation: 'bg-macro-carbs/20 text-macro-carbs'
} as const

export const FavoriteExercisesList: FC<FavoriteExercisesListProps> = ({ exercises }) => {
	const favorites = exercises.filter(e => e.isFavorite).toSorted((a, b) => a.name.localeCompare(b.name))

	if (favorites.length === 0) {
		return (
			<div className="py-4 text-center text-ink-faint text-sm">
				No favorited exercises — tap the star on an exercise to pin it here.
			</div>
		)
	}

	return (
		<div className="space-y-1">
			{favorites.map(ex => {
				const primary = ex.muscles
					.filter(m => m.intensity >= 0.7)
					.map(m => startCase(m.muscleGroup.replace('_', ' ')))
					.join(', ')
				return (
					<div
						key={ex.id}
						className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<Link
									to={`/exercises/${ex.id}`}
									className="font-medium text-ink text-sm hover:underline"
								>
									{ex.name}
								</Link>
								<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[ex.type]}`}>
									{ex.type}
								</span>
							</div>
							{primary && <div className="font-mono text-ink-faint text-xs">{primary}</div>}
						</div>
					</div>
				)
			})}
		</div>
	)
}
