import { Activity, Award, BarChart3, CalendarDays, Dumbbell, Flame, TrendingUp } from 'lucide-react'
import type { FC } from 'react'
import { useSearchParams } from 'react-router'
import { ButtonGroup, Card, CardContent, CardHeader, Spinner, TRPCError } from '~/components/ui'
import { CalendarHeatmap } from '~/features/analytics/components/CalendarHeatmap'
import { RecentPRsList } from '~/features/analytics/components/RecentPRsList'
import { StalledList } from '~/features/analytics/components/StalledList'
import { TopExercisesList } from '~/features/analytics/components/TopExercisesList'
import { WeeklyTrendList } from '~/features/analytics/components/WeeklyTrendList'
import { WeeklyVolumeChart } from '~/features/analytics/components/WeeklyVolumeChart'
import { MuscleHeatGrid } from '~/features/workouts/components/MuscleHeatGrid'
import { prefetchRoute, useDocumentTitle } from '~/lib'
import { trpc } from '~/lib/trpc'
import type { Route } from './+types/analytics._index'

const VALID_WINDOWS = ['4w', '12w', '1y'] as const
type AnalyticsWindow = (typeof VALID_WINDOWS)[number]
const DEFAULT_WINDOW: AnalyticsWindow = '12w'

function parseWindow(raw: string | null): AnalyticsWindow {
	if (raw && (VALID_WINDOWS as readonly string[]).includes(raw)) {
		return raw as AnalyticsWindow
	}
	return DEFAULT_WINDOW
}

export const clientLoader = ({ request }: Route.ClientLoaderArgs) => {
	const window = parseWindow(new URL(request.url).searchParams.get('window'))
	return prefetchRoute(utils => [
		utils.analytics.recentPRs.ensureData({ window }),
		utils.analytics.stalledExercises.ensureData({ window }),
		utils.analytics.weeklyTrend.ensureData({ window }),
		utils.analytics.calendarHeatmap.ensureData({ window }),
		utils.analytics.topExercises.ensureData({ window, limit: 10 }),
		utils.analytics.weeklyVolumeByMuscle.ensureData({ window }),
		utils.workout.coverageStats.ensureData(),
		utils.settings.getProfile.ensureData()
	])
}

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

const AnalyticsPage: FC = () => {
	useDocumentTitle('Analytics')

	const [searchParams, setSearchParams] = useSearchParams()
	const window = parseWindow(searchParams.get('window'))
	const setWindow = (next: AnalyticsWindow) => {
		setSearchParams(
			prev => {
				const params = new URLSearchParams(prev)
				if (next === DEFAULT_WINDOW) {
					params.delete('window')
				} else {
					params.set('window', next)
				}
				return params
			},
			{ replace: true }
		)
	}

	const prsQuery = trpc.analytics.recentPRs.useQuery({ window })
	const stalledQuery = trpc.analytics.stalledExercises.useQuery({ window })
	const weeklyTrendQuery = trpc.analytics.weeklyTrend.useQuery({ window })
	const heatmapQuery = trpc.analytics.calendarHeatmap.useQuery({ window })
	const topExercisesQuery = trpc.analytics.topExercises.useQuery({ window, limit: 10 })
	const weeklyVolumeQuery = trpc.analytics.weeklyVolumeByMuscle.useQuery({ window })

	return (
		<div className="space-y-4">
			{/* Header strip */}
			<div className="flex items-center justify-between gap-3">
				<h1 className="font-semibold text-ink text-lg">Analytics</h1>
				<ButtonGroup options={WINDOW_OPTIONS} value={window} onChange={setWindow} size="sm" />
			</div>

			{/* Compact 2x2 grid on desktop: lists pair side-by-side. Single column on mobile. */}
			<div className="grid gap-4 lg:grid-cols-2">
				{/* Recent PRs */}
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
							<RecentPRsList prs={prsQuery.data ?? []} />
						)}
					</CardContent>
				</Card>

				{/* Stalled feed */}
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
							<StalledList stalled={stalledQuery.data ?? []} />
						)}
					</CardContent>
				</Card>

				{/* Weekly trend deltas */}
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

				{/* Muscle balance */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<Dumbbell className="size-4 text-ink-muted" />
							<h2 className="font-medium text-ink text-sm">Muscle balance</h2>
						</div>
					</CardHeader>
					<CardContent>
						<MuscleHeatGrid />
					</CardContent>
				</Card>

				{/* Most-used exercises (auto-derived from session logs) */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<Flame className="size-4 text-ink-muted" />
							<h2 className="font-medium text-ink text-sm">Most-used exercises</h2>
						</div>
					</CardHeader>
					<CardContent>
						{topExercisesQuery.isLoading ? (
							<div className="flex justify-center py-6">
								<Spinner />
							</div>
						) : topExercisesQuery.error ? (
							<TRPCError error={topExercisesQuery.error} />
						) : (
							<TopExercisesList top={topExercisesQuery.data ?? []} />
						)}
					</CardContent>
				</Card>
			</div>

			{/* Weekly volume by muscle group — full-width stacked bar chart. */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<BarChart3 className="size-4 text-ink-muted" />
						<h2 className="font-medium text-ink text-sm">Weekly volume by muscle group</h2>
					</div>
				</CardHeader>
				<CardContent>
					{weeklyVolumeQuery.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : weeklyVolumeQuery.error ? (
						<TRPCError error={weeklyVolumeQuery.error} />
					) : (
						<WeeklyVolumeChart data={weeklyVolumeQuery.data ?? []} />
					)}
				</CardContent>
			</Card>

			{/* Calendar heatmap stays full-width — needs the room for 1y (53 cols). */}
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

export default AnalyticsPage
