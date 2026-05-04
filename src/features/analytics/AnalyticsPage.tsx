import type { MuscleGroup } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { Activity, Award, CalendarDays, Dumbbell, TrendingUp, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { ButtonGroup, Card, CardContent, CardHeader, Spinner, TRPCError } from '~/components/ui'
import { MuscleHeatGrid } from '~/features/workouts/components/MuscleHeatGrid'
import { useDocumentTitle } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { CalendarHeatmap } from './components/CalendarHeatmap'
import { RecentPRsList } from './components/RecentPRsList'
import { StalledList } from './components/StalledList'
import { WeeklyTrendList } from './components/WeeklyTrendList'

type AnalyticsWindow = '4w' | '12w' | '1y'

type Exercise = RouterOutput['workout']['listExercises'][number]
type PR = RouterOutput['analytics']['recentPRs'][number]
type Stalled = RouterOutput['analytics']['stalledExercises'][number]

const WINDOW_OPTIONS: { value: AnalyticsWindow; label: string }[] = [
	{ value: '4w', label: '4w' },
	{ value: '12w', label: '12w' },
	{ value: '1y', label: '1y' }
]

const WINDOW_WEEKS: Record<AnalyticsWindow, number> = {
	'4w': 4,
	'12w': 12,
	'1y': 53
}

/** Muscles with intensity at or above this contribute to "exercise hits this muscle" filter. */
const MUSCLE_FILTER_INTENSITY = 0.3

export const AnalyticsPage: FC = () => {
	useDocumentTitle('Analytics')

	// TODO: Task 14 — sync to URL params (?window=12w) via useSearchParams.
	const [window, setWindow] = useState<AnalyticsWindow>('12w')
	const [activeMuscle, setActiveMuscle] = useState<MuscleGroup | null>(null)

	const prsQuery = trpc.analytics.recentPRs.useQuery({ window })
	const stalledQuery = trpc.analytics.stalledExercises.useQuery({ window })
	const weeklyTrendQuery = trpc.analytics.weeklyTrend.useQuery({ window })
	const heatmapQuery = trpc.analytics.calendarHeatmap.useQuery({ window })
	const exercisesQuery = trpc.workout.listExercises.useQuery()

	// Build a map of exerciseId → set of muscle groups (>= filter intensity) for body-part filtering.
	const exerciseMusclesMap = useMemo(() => {
		const map = new Map<Exercise['id'], Set<MuscleGroup>>()
		if (!exercisesQuery.data) return map
		for (const ex of exercisesQuery.data) {
			const set = new Set<MuscleGroup>()
			for (const m of ex.muscles) {
				if (m.intensity >= MUSCLE_FILTER_INTENSITY) set.add(m.muscleGroup)
			}
			map.set(ex.id, set)
		}
		return map
	}, [exercisesQuery.data])

	const filteredPRs: PR[] = useMemo(() => {
		if (!prsQuery.data) return []
		if (!activeMuscle) return prsQuery.data
		return prsQuery.data.filter(item => exerciseMusclesMap.get(item.exerciseId)?.has(activeMuscle) ?? false)
	}, [prsQuery.data, activeMuscle, exerciseMusclesMap])

	const filteredStalled: Stalled[] = useMemo(() => {
		if (!stalledQuery.data) return []
		if (!activeMuscle) return stalledQuery.data
		return stalledQuery.data.filter(item => exerciseMusclesMap.get(item.exerciseId)?.has(activeMuscle) ?? false)
	}, [stalledQuery.data, activeMuscle, exerciseMusclesMap])

	function handleMuscleClick(muscle: MuscleGroup) {
		// Toggle: clicking the same muscle clears the filter.
		setActiveMuscle(prev => (prev === muscle ? null : muscle))
	}

	return (
		<div className="space-y-4">
			{/* Header strip */}
			<div className="flex items-center justify-between gap-3">
				<h1 className="font-semibold text-ink text-lg">Analytics</h1>
				<ButtonGroup options={WINDOW_OPTIONS} value={window} onChange={setWindow} size="sm" />
			</div>

			{activeMuscle && (
				<div className="flex items-center justify-between gap-3 rounded-md border border-accent bg-accent/5 px-3 py-2 text-sm">
					<span className="text-ink">
						Showing exercises hitting <span className="font-medium">{startCase(activeMuscle)}</span>
					</span>
					<button
						type="button"
						className="flex items-center gap-1 text-accent text-xs hover:underline"
						onClick={() => setActiveMuscle(null)}
					>
						<X className="size-3.5" />
						Clear filter
					</button>
				</div>
			)}

			{/* 1. Recent PRs (HERO) */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Award className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Recent personal records</h2>
					</div>
				</CardHeader>
				<CardContent>
					{prsQuery.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : prsQuery.error ? (
						<TRPCError error={prsQuery.error} />
					) : (
						<RecentPRsList prs={filteredPRs} />
					)}
				</CardContent>
			</Card>

			{/* 2. Stalled feed */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Activity className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Stalled exercises</h2>
					</div>
				</CardHeader>
				<CardContent>
					{stalledQuery.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : stalledQuery.error ? (
						<TRPCError error={stalledQuery.error} />
					) : (
						<StalledList stalled={filteredStalled} />
					)}
				</CardContent>
			</Card>

			{/* 3. Muscle balance — interactive body map (filters PRs/Stalled) */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Dumbbell className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Muscle balance</h2>
						<span className="ml-auto text-ink-faint text-xs">Click a muscle to filter</span>
					</div>
				</CardHeader>
				<CardContent>
					<MuscleHeatGrid onMuscleClick={handleMuscleClick} activeMuscle={activeMuscle} />
				</CardContent>
			</Card>

			{/* 4. Weekly trend deltas */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<TrendingUp className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Trend vs prior period</h2>
					</div>
				</CardHeader>
				<CardContent>
					{weeklyTrendQuery.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : weeklyTrendQuery.error ? (
						<TRPCError error={weeklyTrendQuery.error} />
					) : (
						<WeeklyTrendList trend={weeklyTrendQuery.data ?? []} />
					)}
				</CardContent>
			</Card>

			{/* 5. Calendar heatmap */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<CalendarDays className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Training density</h2>
					</div>
				</CardHeader>
				<CardContent>
					{heatmapQuery.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : heatmapQuery.error ? (
						<TRPCError error={heatmapQuery.error} />
					) : (
						<CalendarHeatmap data={heatmapQuery.data ?? []} weeks={WINDOW_WEEKS[window]} />
					)}
				</CardContent>
			</Card>
		</div>
	)
}
