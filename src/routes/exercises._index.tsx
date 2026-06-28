import { type MuscleGroup, MUSCLE_GROUPS } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card, Input, LinkButton, Spinner, TRPCError } from '~/components/ui'
import { ExerciseCard } from '~/features/exercises/components/ExerciseCard'
import { ExerciseTable } from '~/features/exercises/components/ExerciseTable'
import { BodyMap } from '~/features/workouts/components/BodyMap'
import { prefetchRoute, useDocumentTitle, useUser } from '~/lib'
import { fuzzyMatch } from '~/lib/fuzzy'
import { type RouterOutput, trpc } from '~/lib/trpc'

export const clientLoader = () =>
	prefetchRoute(utils => [utils.workout.listExercises.ensureData(), utils.settings.getProfile.ensureData()])

type Exercise = RouterOutput['workout']['listExercises'][number]

export default function ExerciseListPage() {
	useDocumentTitle('Exercises')
	const { user } = useUser()
	const userId = user?.id
	const [searchParams, setSearchParams] = useSearchParams()
	const search = searchParams.get('search') ?? ''
	const muscleParam = searchParams.get('muscle')
	const muscle = MUSCLE_GROUPS.find(m => m === muscleParam) ?? null

	const updateParams = (next: { search?: string; muscle?: MuscleGroup | null }) => {
		const nextSearch = next.search ?? search
		const nextMuscle = next.muscle === undefined ? muscle : next.muscle
		const params: Record<string, string> = {}
		if (nextSearch) params.search = nextSearch
		if (nextMuscle) params.muscle = nextMuscle
		setSearchParams(params, { replace: true })
	}
	const setSearch = (value: string) => updateParams({ search: value })
	const toggleMuscle = (m: MuscleGroup) => updateParams({ muscle: muscle === m ? null : m })
	const [sortKey, setSortKey] = useState<'name' | 'type' | 'tier'>('name')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
	const [hoveredExercise, setHoveredExercise] = useState<Exercise | null>(null)
	const utils = trpc.useUtils()

	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const sex = profileQuery.data?.sex ?? 'male'

	const deleteMutation = trpc.workout.deleteExercise.useMutation({
		onSuccess: () => utils.workout.listExercises.invalidate()
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
		const byMuscle = muscle ? all.filter(e => e.muscles.some(m => m.muscleGroup === muscle)) : all
		const list = search
			? byMuscle.filter(e => {
					const muscles = e.muscles.map(m => m.muscleGroup.replace('_', ' ')).join(' ')
					const text = `${e.name} ${e.type} ${muscles} tier ${e.fatigueTier}`
					return fuzzyMatch(search, text) !== null
				})
			: byMuscle
		return list.toSorted((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1
			if (sortKey === 'name') return dir * a.name.localeCompare(b.name)
			if (sortKey === 'type') return dir * a.type.localeCompare(b.type)
			return dir * (a.fatigueTier - b.fatigueTier)
		})
	}, [exercisesQuery.data, search, muscle, sortKey, sortDir])

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

				{muscle && (
					<div className="flex items-center gap-2 text-sm">
						<span className="text-ink-muted">Muscle:</span>
						<button
							type="button"
							onClick={() => toggleMuscle(muscle)}
							className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent/10 px-2 py-0.5 text-accent text-xs"
						>
							{startCase(muscle)}
							<X className="size-3" />
						</button>
					</div>
				)}

				{exercisesQuery.error && <TRPCError error={exercisesQuery.error} />}
				{deleteMutation.error && <TRPCError error={deleteMutation.error} />}

				{exercisesQuery.isLoading && (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				)}

				{filtered.length === 0 && !exercisesQuery.isLoading && (
					<Card className="py-12 text-center text-ink-faint">
						{search || muscle ? 'No exercises match your filters.' : 'No exercises yet.'}
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
					/>
				)}
			</div>

			<div className="hidden lg:sticky lg:top-16 lg:block lg:self-start">
				<div className="w-64 space-y-2">
					<div className="h-5 text-center font-medium text-ink text-sm">
						{hoveredExercise?.name ?? (muscle ? startCase(muscle) : '')}
					</div>
					<BodyMap
						muscleVolumes={hoveredVolumes}
						sex={sex}
						onMuscleClick={toggleMuscle}
						selectedMuscle={muscle}
						renderTooltip={hovered => {
							const m = hoveredExercise?.muscles.find(m => m.muscleGroup === hovered)
							if (!m) return null
							return (
								<div className="font-mono text-[10px] text-ink-muted tabular-nums">
									{m.intensity.toFixed(1)} intensity
								</div>
							)
						}}
					/>
					<p className="text-center text-ink-faint text-xs">Click a muscle to filter</p>
				</div>
			</div>
		</div>
	)
}
