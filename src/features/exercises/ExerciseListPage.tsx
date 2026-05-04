import type { MuscleGroup } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { ArrowDown, ArrowUp, Plus, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Input, LinkButton, Spinner, TRPCError } from '~/components/ui'
import { useDocumentTitle, useUser } from '~/lib'
import { fuzzyMatch } from '~/lib/fuzzy'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { BodyMap } from '../workouts/components/BodyMap'
import { ExerciseCard } from './components/ExerciseCard'
import { ExerciseTable } from './components/ExerciseTable'

type Exercise = RouterOutput['workout']['listExercises'][number]

export function ExerciseListPage() {
	useDocumentTitle('Exercises')
	const { user } = useUser()
	const userId = user?.id
	const [searchParams, setSearchParams] = useSearchParams()
	const search = searchParams.get('search') ?? ''
	const setSearch = (value: string) => setSearchParams(value ? { search: value } : {}, { replace: true })
	const [sortKey, setSortKey] = useState<'name' | 'type' | 'tier'>('name')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
	const [favoritesOnly, setFavoritesOnly] = useState(false)
	const [hoveredExercise, setHoveredExercise] = useState<Exercise | null>(null)
	const utils = trpc.useUtils()

	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const sex = profileQuery.data?.sex ?? 'male'

	const deleteMutation = trpc.workout.deleteExercise.useMutation({
		onSuccess: () => utils.workout.listExercises.invalidate()
	})

	type FavoriteContext = { prev: Exercise[] | undefined }

	async function applyFavoriteOptimistic(exerciseId: Exercise['id'], next: boolean): Promise<FavoriteContext> {
		await utils.workout.listExercises.cancel()
		const prev = utils.workout.listExercises.getData()
		utils.workout.listExercises.setData(undefined, old =>
			old?.map(e => (e.id === exerciseId ? { ...e, isFavorite: next } : e))
		)
		return { prev }
	}

	function rollbackFavorite(ctx: FavoriteContext | undefined) {
		if (ctx?.prev) utils.workout.listExercises.setData(undefined, ctx.prev)
	}

	const favoriteMutation = trpc.workout.favoriteExercise.useMutation({
		onMutate: ({ exerciseId }) => applyFavoriteOptimistic(exerciseId, true),
		onError: (_err, _vars, ctx) => rollbackFavorite(ctx),
		onSettled: () => utils.workout.listExercises.invalidate()
	})

	const unfavoriteMutation = trpc.workout.unfavoriteExercise.useMutation({
		onMutate: ({ exerciseId }) => applyFavoriteOptimistic(exerciseId, false),
		onError: (_err, _vars, ctx) => rollbackFavorite(ctx),
		onSettled: () => utils.workout.listExercises.invalidate()
	})

	const toggleSort = (key: typeof sortKey) => {
		if (sortKey === key) {
			setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
		} else {
			setSortKey(key)
			setSortDir('asc')
		}
	}

	const filtered = useMemo(() => {
		const all = exercisesQuery.data ?? []
		const afterFavorite = favoritesOnly ? all.filter(e => e.isFavorite) : all
		const list = search
			? afterFavorite.filter(e => {
					const muscles = e.muscles.map(m => m.muscleGroup.replace('_', ' ')).join(' ')
					const text = `${e.name} ${e.type} ${muscles} tier ${e.fatigueTier}`
					return fuzzyMatch(search, text) !== null
				})
			: afterFavorite
		const sorted = list.toSorted((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1
			if (sortKey === 'name') return dir * a.name.localeCompare(b.name)
			if (sortKey === 'type') return dir * a.type.localeCompare(b.type)
			return dir * (a.fatigueTier - b.fatigueTier)
		})
		// Pin favorites to the top only when the user hasn't filtered or re-sorted —
		// once they're searching, sorting by type/tier, or already filtering to favorites,
		// the pinning is either redundant or against the user's explicit choice.
		const pinFavorites = !(search || favoritesOnly) && sortKey === 'name' && sortDir === 'asc'
		if (!pinFavorites) return sorted
		const favorites = sorted.filter(e => e.isFavorite)
		const rest = sorted.filter(e => !e.isFavorite)
		return [...favorites, ...rest]
	}, [exercisesQuery.data, search, sortKey, sortDir, favoritesOnly])

	const hoveredVolumes = useMemo(() => {
		const volumes = new Map<MuscleGroup, number>()
		if (!hoveredExercise) return volumes
		for (const m of hoveredExercise.muscles) {
			volumes.set(m.muscleGroup, m.intensity)
		}
		return volumes
	}, [hoveredExercise])

	function handleDelete(id: Exercise['id']) {
		deleteMutation.mutate({ id })
	}

	function handleFavoriteToggle(exercise: Exercise) {
		if (exercise.isFavorite) {
			unfavoriteMutation.mutate({ exerciseId: exercise.id })
		} else {
			favoriteMutation.mutate({ exerciseId: exercise.id })
		}
	}

	return (
		<div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
			<div className="flex-1 space-y-3">
				<div className="flex items-center justify-between">
					<h1 className="font-semibold text-ink">Exercises</h1>
					{user && (
						<LinkButton to="/exercises/new">
							<Plus className="size-4" />
							Add Exercise
						</LinkButton>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Input placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} />
					<div className="flex shrink-0 gap-1">
						<button
							type="button"
							aria-pressed={favoritesOnly}
							className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-xs transition-colors ${favoritesOnly ? 'border-accent bg-accent/10 text-accent' : 'border-edge text-ink-muted hover:bg-surface-2'}`}
							onClick={() => setFavoritesOnly(v => !v)}
						>
							<Star className="size-3" fill={favoritesOnly ? 'currentColor' : 'none'} />
							Favorites
						</button>
						{(['name', 'type', 'tier'] as const).map(key => (
							<button
								key={key}
								type="button"
								className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-xs transition-colors ${sortKey === key ? 'border-accent bg-accent/10 text-accent' : 'border-edge text-ink-muted hover:bg-surface-2'}`}
								onClick={() => toggleSort(key)}
							>
								{startCase(key)}
								{sortKey === key &&
									(sortDir === 'asc' ? (
										<ArrowUp className="size-3" />
									) : (
										<ArrowDown className="size-3" />
									))}
							</button>
						))}
					</div>
				</div>

				{exercisesQuery.error && <TRPCError error={exercisesQuery.error} />}
				{deleteMutation.error && <TRPCError error={deleteMutation.error} />}

				{exercisesQuery.isLoading && (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				)}

				{filtered.length === 0 && !exercisesQuery.isLoading && (
					<Card className="py-12 text-center text-ink-faint">
						{search
							? 'No exercises match your search.'
							: favoritesOnly
								? 'No favorited exercises yet — tap a star to favorite one.'
								: 'No exercises yet.'}
					</Card>
				)}

				{filtered.length > 0 && (
					<div className="grid gap-2 md:hidden">
						{filtered.map(exercise => (
							<ExerciseCard
								key={exercise.id}
								exercise={exercise}
								isMine={exercise.userId === userId}
								onDelete={handleDelete}
								onFavoriteToggle={handleFavoriteToggle}
							/>
						))}
					</div>
				)}

				{filtered.length > 0 && (
					<ExerciseTable
						exercises={filtered}
						userId={userId}
						sortKey={sortKey}
						sortDir={sortDir}
						onToggleSort={toggleSort}
						onHover={setHoveredExercise}
						onDelete={handleDelete}
						onFavoriteToggle={handleFavoriteToggle}
					/>
				)}
			</div>

			<div className="hidden lg:sticky lg:top-16 lg:block lg:self-start">
				<div className="w-64 space-y-2">
					<div className="h-5 text-center font-medium text-ink text-sm">{hoveredExercise?.name}</div>
					<BodyMap
						muscleVolumes={hoveredVolumes}
						sex={sex}
						renderTooltip={muscle => {
							const m = hoveredExercise?.muscles.find(m => m.muscleGroup === muscle)
							if (!m) return null
							return (
								<div className="font-mono text-[10px] text-ink-muted tabular-nums">
									{m.intensity.toFixed(1)} intensity
								</div>
							)
						}}
					/>
				</div>
			</div>
		</div>
	)
}
