import { type Exercise, formatEquipment } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, ButtonGroup, Card, CardContent, CardHeader, Spinner, TRPCError } from '~/components/ui'
import { useDocumentTitle, useUser } from '~/lib'
import { formatDate } from '~/lib/date'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { METRIC_LABEL, METRIC_UNIT } from '~/lib/workouts/constants'
import { ExerciseGuideContent } from '../workouts/components/ExerciseGuideContent'
import { ExerciseForm } from './components/ExerciseForm'
import { HistoryChart, type HistoryChartMetric } from './components/HistoryChart'
import { HistoryTable } from './components/HistoryTable'

type ExerciseRow = RouterOutput['workout']['listExercises'][number]
type HistoryEntry = RouterOutput['workout']['exerciseHistory'][number]

const TYPE_BADGE = {
	compound: 'bg-macro-protein/20 text-macro-protein',
	isolation: 'bg-macro-carbs/20 text-macro-carbs'
} as const

type HistoryWindow = '4w' | '12w' | '1y'

const METRIC_OPTIONS: { value: HistoryChartMetric; label: string }[] = [
	{ value: 'e1rm', label: METRIC_LABEL.e1rm },
	{ value: 'volume', label: METRIC_LABEL.volume },
	{ value: 'weight', label: METRIC_LABEL.weight }
]

const WINDOW_OPTIONS: { value: HistoryWindow; label: string }[] = [
	{ value: '4w', label: '4w' },
	{ value: '12w', label: '12w' },
	{ value: '1y', label: '1y' }
]

function formatRange(min: number | null, max: number | null) {
	if (min == null && max == null) return '—'
	if (min != null && max != null) return `${min}–${max}`
	return `${min ?? max}`
}

function formatNumber(n: number, digits = 1): string {
	if (!Number.isFinite(n)) return '–'
	return n.toFixed(digits).replace(/\.?0+$/, '')
}

function pickBestE1rm(history: HistoryEntry[]): HistoryEntry | null {
	let best: HistoryEntry | null = null
	for (const entry of history) {
		if (entry.e1rm <= 0) continue
		if (!best || entry.e1rm > best.e1rm) best = entry
	}
	return best
}

export function ExerciseDetailPage() {
	const { id } = useParams<{ id: Exercise['id'] }>()
	const navigate = useNavigate()
	const { user } = useUser()
	const isNew = !id

	const exercisesQuery = trpc.workout.listExercises.useQuery()
	const exercise = useMemo(
		() => (id ? (exercisesQuery.data?.find(e => e.id === id) ?? null) : null),
		[exercisesQuery.data, id]
	)
	const isOwned = !!exercise && exercise.userId === user?.id

	useDocumentTitle(isNew ? 'New exercise' : exercise ? `${exercise.name} | Exercises` : 'Exercise')

	if (isNew) return <CreateMode onCreated={() => navigate('/exercises')} />

	if (exercisesQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (!exercisesQuery.data && exercisesQuery.error) {
		return (
			<div className="space-y-3">
				<BackLink />
				<TRPCError error={exercisesQuery.error} />
			</div>
		)
	}

	if (!exercise) {
		return (
			<div className="space-y-3">
				<BackLink />
				<Card className="py-12 text-center text-ink-faint">
					<p>Exercise not found.</p>
					<Link to="/exercises" className="mt-2 inline-block text-accent hover:underline">
						Back to exercises
					</Link>
				</Card>
			</div>
		)
	}

	return (
		<>
			{exercisesQuery.error && <TRPCError error={exercisesQuery.error} />}
			<ViewEditMode exercise={exercise} isOwned={isOwned} onDelete={() => navigate('/exercises')} />
		</>
	)
}

interface CreateModeProps {
	onCreated: () => void
}

const CreateMode = ({ onCreated }: CreateModeProps) => (
	<div className="space-y-3">
		<div className="flex items-center gap-3">
			<Link to="/exercises" aria-label="Back to exercises" className="text-ink-faint hover:text-ink">
				<ArrowLeft className="size-4" />
			</Link>
			<h1 className="font-semibold text-ink text-lg">New exercise</h1>
		</div>
		<Card className="p-4">
			<ExerciseForm onClose={onCreated} />
		</Card>
	</div>
)

interface ViewEditModeProps {
	exercise: ExerciseRow
	isOwned: boolean
	onDelete: () => void
}

const ViewEditMode = ({ exercise, isOwned, onDelete }: ViewEditModeProps) => {
	const utils = trpc.useUtils()
	const [metric, setMetric] = useState<HistoryChartMetric>('e1rm')
	const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('12w')

	const historyQuery = trpc.workout.exerciseHistory.useQuery({ exerciseId: exercise.id, window: historyWindow })
	// Pull the full year for "best ever" stats so the badge survives window changes.
	const lifetimeQuery = trpc.workout.exerciseHistory.useQuery({ exerciseId: exercise.id, window: '1y' })

	const deleteMutation = trpc.workout.deleteExercise.useMutation({
		onSuccess: () => {
			utils.workout.listExercises.invalidate()
			onDelete()
		}
	})

	function handleClose() {
		// Form's "Done" button — refresh data, stay on page.
		utils.workout.listExercises.invalidate()
	}

	function handleDelete() {
		if (window.confirm(`Delete ${exercise.name}? This cannot be undone.`)) {
			deleteMutation.mutate({ id: exercise.id })
		}
	}

	const historyData = historyQuery.data ?? []
	const lifetimeData = lifetimeQuery.data ?? []
	const bestEver = pickBestE1rm(lifetimeData)
	const lastLogged = lifetimeData.length > 0 ? lifetimeData[lifetimeData.length - 1] : null

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Link to="/exercises" aria-label="Back to exercises" className="text-ink-faint hover:text-ink">
					<ArrowLeft className="size-4" />
				</Link>
				<h1 className="min-w-0 truncate font-semibold text-ink text-lg">{exercise.name}</h1>
				<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[exercise.type]}`}>
					{exercise.type}
				</span>
				<span className="shrink-0 font-mono text-ink-faint text-xs tabular-nums">T{exercise.fatigueTier}</span>
				{!exercise.userId && (
					<a
						href={`${import.meta.env.VITE_REPO_URL}/blob/main/scripts/seed-exercises.ts`}
						target="_blank"
						rel="noopener noreferrer"
						className="shrink-0 text-ink-faint hover:text-ink"
						aria-label="View seed source on GitHub"
					>
						<ExternalLink className="size-3" />
					</a>
				)}
			</div>

			{/* Top: edit form OR read-only summary */}
			{isOwned ? (
				<Card className="p-4">
					<ExerciseForm editExercise={exercise} onClose={handleClose} />
					<div className="mt-3 flex flex-col items-end gap-2 border-edge border-t pt-3">
						<Button
							variant="destructive"
							size="sm"
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? 'Deleting…' : 'Delete exercise'}
						</Button>
						{deleteMutation.error && <TRPCError error={deleteMutation.error} />}
					</div>
				</Card>
			) : (
				<SystemSummary exercise={exercise} />
			)}

			{/* Middle: history */}
			<Card>
				<CardHeader className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="font-semibold text-ink text-sm">History</h2>
					<div className="flex flex-wrap items-center gap-2">
						<ButtonGroup options={METRIC_OPTIONS} value={metric} onChange={setMetric} size="sm" />
						<ButtonGroup
							options={WINDOW_OPTIONS}
							value={historyWindow}
							onChange={setHistoryWindow}
							size="sm"
						/>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{historyQuery.error && <TRPCError error={historyQuery.error} />}

					{historyQuery.isLoading ? (
						<div className="flex justify-center py-8">
							<Spinner />
						</div>
					) : (
						<HistoryChart data={historyData} metric={metric} />
					)}

					{(bestEver || lastLogged) && (
						<dl className="grid gap-3 border-edge border-t pt-3 text-sm sm:grid-cols-2">
							{bestEver && (
								<div>
									<dt className="text-[10px] text-ink-faint uppercase tracking-wide">
										Best {METRIC_LABEL.e1rm}
									</dt>
									<dd className="mt-0.5 font-mono text-ink tabular-nums">
										{formatNumber(bestEver.e1rm)}
										{METRIC_UNIT.e1rm}
										<span className="ml-2 text-ink-faint text-xs">
											{bestEver.topSet.weightKg}
											{METRIC_UNIT.weight} × {bestEver.topSet.reps} on{' '}
											{formatDate(bestEver.startedAt)}
										</span>
									</dd>
								</div>
							)}
							{lastLogged && (
								<div>
									<dt className="text-[10px] text-ink-faint uppercase tracking-wide">Last logged</dt>
									<dd className="mt-0.5 font-mono text-ink tabular-nums">
										{formatDate(lastLogged.startedAt)}
										<span className="ml-2 text-ink-faint text-xs">
											{lastLogged.topSet.weightKg}
											{METRIC_UNIT.weight} × {lastLogged.topSet.reps}
											{lastLogged.workingSetCount > 1 && ` (${lastLogged.workingSetCount} sets)`}
										</span>
									</dd>
								</div>
							)}
						</dl>
					)}

					{!historyQuery.isLoading && historyData.length > 0 && <HistoryTable data={historyData} />}
				</CardContent>
			</Card>

			{/* Bottom: technique guide — owners edit via the form's GuideEditor;
			    viewers (system exercises) read via this inline render. */}
			{!isOwned && (
				<Card>
					<CardHeader>
						<h2 className="font-semibold text-ink text-sm">Technique guide</h2>
					</CardHeader>
					<CardContent>
						<ExerciseGuideContent exerciseId={exercise.id} exerciseName={exercise.name} />
					</CardContent>
				</Card>
			)}
		</div>
	)
}

const BackLink = () => (
	<div className="flex items-center gap-3">
		<Link to="/exercises" aria-label="Back to exercises" className="text-ink-faint hover:text-ink">
			<ArrowLeft className="size-4" />
		</Link>
		<h1 className="font-semibold text-ink text-lg">Exercise</h1>
	</div>
)

interface SystemSummaryProps {
	exercise: ExerciseRow
}

const SystemSummary = ({ exercise }: SystemSummaryProps) => {
	const sortedMuscles = [...exercise.muscles].sort((a, b) => b.intensity - a.intensity)
	return (
		<Card>
			<CardContent className="space-y-3">
				<div className="grid gap-3 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-[10px] text-ink-faint uppercase tracking-wide">Strength reps</dt>
						<dd className="mt-0.5 font-mono text-ink tabular-nums">
							{formatRange(exercise.strengthRepsMin, exercise.strengthRepsMax)}
						</dd>
					</div>
					<div>
						<dt className="text-[10px] text-ink-faint uppercase tracking-wide">Hypertrophy reps</dt>
						<dd className="mt-0.5 font-mono text-ink tabular-nums">
							{formatRange(exercise.hypertrophyRepsMin, exercise.hypertrophyRepsMax)}
						</dd>
					</div>
				</div>

				<div>
					<div className="text-[10px] text-ink-faint uppercase tracking-wide">Equipment</div>
					{exercise.equipment.length === 0 ? (
						<p className="mt-1 text-ink-faint text-xs italic">None — bodyweight only.</p>
					) : (
						<ul className="mt-1 flex flex-wrap gap-1.5">
							{exercise.equipment.map(e => (
								<li
									key={e.equipment}
									className="rounded-full bg-surface-2 px-2 py-0.5 text-ink text-xs"
								>
									{formatEquipment(e.equipment)}
								</li>
							))}
						</ul>
					)}
				</div>

				<div>
					<div className="text-[10px] text-ink-faint uppercase tracking-wide">Muscles</div>
					{sortedMuscles.length === 0 ? (
						<p className="mt-1 text-ink-faint text-xs italic">No muscles defined.</p>
					) : (
						<ul className="mt-1 flex flex-wrap gap-1.5">
							{sortedMuscles.map(m => (
								<li
									key={m.muscleGroup}
									className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs"
								>
									<span className="text-ink">{startCase(m.muscleGroup)}</span>
									<span className="font-mono text-[10px] text-ink-faint tabular-nums">
										{m.intensity.toFixed(1)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>

				<p className="text-ink-faint text-xs italic">
					System exercises can't be edited. Create a custom exercise to tweak rep ranges or muscles.
				</p>
			</CardContent>
		</Card>
	)
}
