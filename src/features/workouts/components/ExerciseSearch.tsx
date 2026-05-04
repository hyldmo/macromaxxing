import { Plus, Search, Star } from 'lucide-react'
import { type FC, useState } from 'react'
import { Card, Input } from '~/components/ui'
import { fuzzyMatch } from '~/lib/fuzzy'
import type { RouterOutput } from '~/lib/trpc'

type Exercise = RouterOutput['workout']['listExercises'][number]

function exerciseSearchText(e: Exercise): string {
	const muscles = e.muscles.map(m => m.muscleGroup.replace('_', ' ')).join(' ')
	return `${e.name} ${e.type} ${muscles} tier ${e.fatigueTier}`
}

export interface ExerciseSearchProps {
	exercises: Exercise[]
	onSelect: (exercise: Exercise) => void
}

const TYPE_BADGE = {
	compound: 'bg-macro-protein/20 text-macro-protein',
	isolation: 'bg-macro-carbs/20 text-macro-carbs'
} as const

const RESULT_CAP = 12

export const ExerciseSearch: FC<ExerciseSearchProps> = ({ exercises, onSelect }) => {
	const [search, setSearch] = useState('')
	const [showDropdown, setShowDropdown] = useState(false)

	const filtered = search
		? exercises
				.map(e => ({ exercise: e, match: fuzzyMatch(search, exerciseSearchText(e)) }))
				.filter((r): r is typeof r & { match: NonNullable<typeof r.match> } => r.match !== null)
				.toSorted((a, b) => b.match.score - a.match.score)
				.slice(0, RESULT_CAP)
				.map(r => r.exercise)
		: []

	const favoriteList = search ? [] : exercises.filter(e => e.isFavorite).slice(0, RESULT_CAP)

	const renderRow = (exercise: Exercise) => (
		<button
			key={exercise.id}
			type="button"
			className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
			onMouseDown={() => {
				onSelect(exercise)
				setSearch('')
				setShowDropdown(false)
			}}
		>
			<Plus className="size-3.5 shrink-0 text-ink-faint" />
			<span className="text-ink">{exercise.name}</span>
			<span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[exercise.type]}`}>
				{exercise.type}
			</span>
			<span className="font-mono text-[10px] text-ink-faint">
				{exercise.muscles
					.filter(m => m.intensity >= 0.7)
					.map(m => m.muscleGroup.replace('_', ' '))
					.join(', ')}
			</span>
		</button>
	)

	return (
		<div className="relative">
			<div className="relative">
				<Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
				<Input
					placeholder="Search exercise..."
					value={search}
					onChange={e => {
						setSearch(e.target.value)
						setShowDropdown(true)
					}}
					onFocus={() => setShowDropdown(true)}
					onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
					className="pl-8"
				/>
			</div>
			{showDropdown && (search.length > 0 || favoriteList.length > 0) && (
				<Card className="absolute top-full z-10 mt-1 w-full">
					{search.length > 0 ? (
						<>
							{filtered.map(renderRow)}
							{filtered.length === 0 && (
								<div className="px-3 py-2 text-ink-faint text-sm">No exercises found</div>
							)}
						</>
					) : (
						<>
							<div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] text-ink-faint uppercase tracking-wide">
								<Star className="size-3" fill="currentColor" />
								Favorites
							</div>
							{favoriteList.map(renderRow)}
						</>
					)}
				</Card>
			)}
		</div>
	)
}
