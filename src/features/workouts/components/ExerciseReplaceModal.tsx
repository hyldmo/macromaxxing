import { Search, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Input, Modal } from '~/components/ui'
import { rankBySimilarity, type ScoredExercise } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type Exercise = RouterOutput['workout']['listExercises'][number]

const TYPE_BADGE = {
	compound: 'bg-macro-protein/20 text-macro-protein',
	isolation: 'bg-macro-carbs/20 text-macro-carbs'
} as const

export interface ExerciseReplaceModalProps {
	exerciseId: string
	exerciseName: string
	allExercises: Exercise[]
	excludeIds: Set<string>
	onReplace: (exercise: Exercise) => void
	onClose: () => void
}

export const ExerciseReplaceModal: FC<ExerciseReplaceModalProps> = ({
	exerciseId,
	exerciseName,
	allExercises,
	excludeIds,
	onReplace,
	onClose
}) => {
	const [search, setSearch] = useState('')

	const sourceExercise = useMemo(() => allExercises.find(e => e.id === exerciseId), [allExercises, exerciseId])

	const ranked = useMemo(
		() => (sourceExercise ? rankBySimilarity(sourceExercise, allExercises, excludeIds) : []),
		[sourceExercise, allExercises, excludeIds]
	)

	const isSearching = search.length > 0
	const query = search.toLowerCase()

	const displayed: ScoredExercise[] = isSearching
		? allExercises
				.filter(e => !excludeIds.has(e.id) && e.name.toLowerCase().includes(query))
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, 20)
				.map(exercise => ({ exercise, score: 0 }))
		: ranked.slice(0, 20)

	return (
		<Modal onClose={onClose} className="w-full max-w-md">
			<div className="flex items-center justify-between border-edge border-b px-4 py-3">
				<h2 className="font-semibold text-ink">Replace {exerciseName}</h2>
				<button
					type="button"
					onClick={onClose}
					className="rounded-sm p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
				>
					<X className="size-5" />
				</button>
			</div>

			<div className="p-4">
				<div className="relative">
					<Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
					<Input
						placeholder="Search exercises..."
						value={search}
						onChange={e => setSearch(e.target.value)}
						className="pl-8"
						autoFocus
					/>
				</div>

				<div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
					{displayed.map(({ exercise: ex, score }) => (
						<button
							key={ex.id}
							type="button"
							onClick={() => onReplace(ex)}
							className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
						>
							<span className="min-w-0 flex-1 truncate text-ink">{ex.name}</span>
							<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[ex.type]}`}>
								{ex.type}
							</span>
							<span className="shrink-0 font-mono text-[10px] text-ink-faint">
								{ex.muscles
									.filter(m => m.intensity >= 0.7)
									.map(m => m.muscleGroup.replace('_', ' '))
									.join(', ')}
							</span>
							{!isSearching && (
								<span className="shrink-0 font-mono text-[10px] text-accent tabular-nums">
									{Math.round(score * 100)}%
								</span>
							)}
						</button>
					))}
					{displayed.length === 0 && (
						<div className="py-4 text-center text-ink-faint text-sm">No exercises found</div>
					)}
				</div>
			</div>
		</Modal>
	)
}
