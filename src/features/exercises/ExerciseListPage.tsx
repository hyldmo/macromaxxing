import type { MuscleGroup } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, Input, Spinner, TRPCError } from '~/components/ui'
import { useDocumentTitle, useUser } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { BodyMap } from '../workouts/components/BodyMap'
import { ExerciseCard } from './components/ExerciseCard'
import { ExerciseForm } from './components/ExerciseForm'
import { ExerciseTable } from './components/ExerciseTable'

type Exercise = RouterOutput['workout']['listExercises'][number]

export function ExerciseListPage() {
	useDocumentTitle('Exercises')
	const { user } = useUser()
	const userId = user?.id
	const [search, setSearch] = useState('')
	const [showForm, setShowForm] = useState(false)
	const [editId, setEditId] = useState<string | null>(null)
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
		const list = exercisesQuery.data?.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) ?? []
		return list.toSorted((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1
			if (sortKey === 'name') return dir * a.name.localeCompare(b.name)
			if (sortKey === 'type') return dir * a.type.localeCompare(b.type)
			return dir * (a.fatigueTier - b.fatigueTier)
		})
	}, [exercisesQuery.data, search, sortKey, sortDir])

	const editExercise = editId ? exercisesQuery.data?.find(e => e.id === editId) : undefined

	const hoveredVolumes = useMemo(() => {
		const volumes = new Map<MuscleGroup, number>()
		if (!hoveredExercise) return volumes
		for (const m of hoveredExercise.muscles) {
			volumes.set(m.muscleGroup, m.intensity)
		}
		return volumes
	}, [hoveredExercise])

	function handleEdit(id: string) {
		setEditId(id)
		setShowForm(false)
	}

	function handleDelete(id: string) {
		deleteMutation.mutate({ id: id as Exercise['id'] })
	}

	return (
		<div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
			<div className="flex-1 space-y-3">
				<div className="flex items-center justify-between">
					<h1 className="font-semibold text-ink">Exercises</h1>
					{user && (
						<Button
							onClick={() => {
								setEditId(null)
								setShowForm(true)
							}}
						>
							<Plus className="size-4" />
							Add Exercise
						</Button>
					)}
				</div>

				{(showForm || editId) && (
					<Card className="p-4">
						<ExerciseForm
							editExercise={editExercise}
							onClose={() => {
								setShowForm(false)
								setEditId(null)
							}}
						/>
					</Card>
				)}

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

				{exercisesQuery.error && <TRPCError error={exercisesQuery.error} />}
				{deleteMutation.error && <TRPCError error={deleteMutation.error} />}

				{exercisesQuery.isLoading && (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				)}

				{filtered.length === 0 && !exercisesQuery.isLoading && (
					<Card className="py-12 text-center text-ink-faint">
						{search ? 'No exercises match your search.' : 'No exercises yet.'}
					</Card>
				)}

				{filtered.length > 0 && (
					<div className="grid gap-2 md:hidden">
						{filtered.map(exercise => (
							<ExerciseCard
								key={exercise.id}
								exercise={exercise}
								isMine={exercise.userId === userId}
								onEdit={handleEdit}
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
						onEdit={handleEdit}
						onDelete={handleDelete}
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
