import type { MuscleGroup } from '@macromaxxing/db'
import type { ComponentProps, FC, ReactNode } from 'react'
import { CalendarHeatmap } from '~/features/analytics/components/CalendarHeatmap'
import { RecentPRsList } from '~/features/analytics/components/RecentPRsList'
import { StalledList } from '~/features/analytics/components/StalledList'
import { WeeklyVolumeChart } from '~/features/analytics/components/WeeklyVolumeChart'
import { HistoryChart, type HistoryChartDatum } from '~/features/exercises/components/HistoryChart'
import { cn } from '~/lib'
import { MonoLabel, SectionShell } from '../components'

type PRRow = ComponentProps<typeof RecentPRsList>['prs'][number]
type StalledRow = ComponentProps<typeof StalledList>['stalled'][number]
type HeatmapRow = ComponentProps<typeof CalendarHeatmap>['data'][number]
type VolumeRow = ComponentProps<typeof WeeklyVolumeChart>['data'][number]

export const SignalSection: FC = () => (
	<SectionShell
		id="signal"
		marker="§ 04 / Signal"
		title="Logged sets become signal."
		kicker="Every working set feeds a graph. PRs flag themselves. Stalls surface. The week's volume shows up by muscle."
		variant="alt"
	>
		<div className="grid gap-px overflow-hidden border border-edge bg-edge md:grid-cols-2">
			<SignalCard
				eyebrow="Weekly volume"
				title="Stacked by muscle group"
				body="Working sets weighted by muscle intensity, summed per week, stacked by group. Read the trend; spot the muscle that quietly fell off."
				visual={<WeeklyVolumeChart data={VOLUME_DATA} />}
			/>
			<SignalCard
				eyebrow="PRs"
				title="Detected, not declared"
				body="When estimated 1RM beats the prior best by more than 0.5 kg, it flags itself. No streaks, no toasts — a quiet ↑ next to the lift."
				visual={<RecentPRsList prs={PR_DATA} />}
			/>
			<SignalCard
				eyebrow="Stalled"
				title="Flatlines surface"
				body="Three sessions without a top-set or e1RM gain and the lift surfaces here. Deload, swap, or push — the call is yours."
				visual={<StalledList stalled={STALLED_DATA} />}
			/>
			<SignalCard
				eyebrow="Calendar"
				title="Density by day"
				body="Sessions, working sets — coloured by intensity. The empty cells say more than the full ones."
				visual={<CalendarHeatmap data={HEATMAP_DATA} weeks={10} />}
			/>
			<SignalCard
				className="md:col-span-2"
				eyebrow="Per-exercise"
				title="e1RM over time"
				body="Open any lift to see top set, e1RM, and volume per session. Every dot is one rep that earned it."
				visual={
					<div className="space-y-2">
						<div className="flex items-baseline justify-between">
							<MonoLabel>Barbell Bench Press · last 12 sessions</MonoLabel>
							<span className="font-mono text-ink text-sm tabular-nums">119.4 kg</span>
						</div>
						<HistoryChart data={HISTORY_DATA} metric="e1rm" />
					</div>
				}
			/>
		</div>
	</SectionShell>
)

interface SignalCardProps {
	eyebrow: string
	title: string
	body: string
	visual: ReactNode
	className?: string
}

const SignalCard: FC<SignalCardProps> = ({ eyebrow, title, body, visual, className }) => (
	<article className={cn('flex flex-col bg-surface-0 p-8', className)}>
		<MonoLabel className="text-accent">{eyebrow}</MonoLabel>
		<h3 className="mt-3 font-display font-normal text-2xl leading-tight tracking-tight md:text-3xl">{title}</h3>
		<p className="mt-3 font-display text-base text-ink-muted leading-relaxed">{body}</p>
		<div className="mt-8 border-edge border-t pt-6">{visual}</div>
	</article>
)

// ---------------------------------------------------------------------------
// Mock data — typed against the real router/component shapes.
// exerciseId set to null so the analytics list components skip Link rendering
// (no navigation to fake demo IDs).
// ---------------------------------------------------------------------------

type Volumes = Partial<Record<MuscleGroup, number>>

function makeWeek(weekStart: string, volumes: Volumes): VolumeRow {
	let total = 0
	for (const v of Object.values(volumes)) total += v ?? 0
	return { weekStart, volumes, totalVolume: total }
}

const VOLUME_DATA: VolumeRow[] = [
	makeWeek('2026-02-23', {
		chest: 3200,
		lats: 1400,
		upper_back: 1000,
		quads: 2800,
		hamstrings: 1600,
		front_delts: 900,
		side_delts: 600,
		biceps: 700,
		triceps: 1100,
		glutes: 800,
		core: 600
	}),
	makeWeek('2026-03-02', {
		chest: 3400,
		lats: 1500,
		upper_back: 1100,
		quads: 3000,
		hamstrings: 1700,
		front_delts: 950,
		side_delts: 650,
		biceps: 750,
		triceps: 1150,
		glutes: 850,
		core: 700
	}),
	makeWeek('2026-03-09', {
		chest: 3000,
		lats: 1600,
		upper_back: 1200,
		quads: 3300,
		hamstrings: 1800,
		front_delts: 1000,
		side_delts: 700,
		biceps: 800,
		triceps: 1100,
		glutes: 900,
		core: 800
	}),
	makeWeek('2026-03-16', {
		chest: 3600,
		lats: 1500,
		upper_back: 1200,
		quads: 3500,
		hamstrings: 1900,
		front_delts: 1050,
		side_delts: 750,
		biceps: 850,
		triceps: 1250,
		glutes: 950,
		core: 700
	}),
	makeWeek('2026-03-23', {
		chest: 3800,
		lats: 1700,
		upper_back: 1200,
		quads: 3600,
		hamstrings: 2000,
		front_delts: 1100,
		side_delts: 800,
		biceps: 900,
		triceps: 1300,
		glutes: 1000,
		core: 800
	}),
	makeWeek('2026-03-30', {
		chest: 3500,
		lats: 1800,
		upper_back: 1300,
		quads: 3800,
		hamstrings: 2100,
		front_delts: 1150,
		side_delts: 850,
		biceps: 950,
		triceps: 1250,
		glutes: 1050,
		core: 900
	}),
	makeWeek('2026-04-06', {
		chest: 4000,
		lats: 1900,
		upper_back: 1300,
		quads: 4000,
		hamstrings: 2200,
		front_delts: 1200,
		side_delts: 900,
		biceps: 1000,
		triceps: 1400,
		glutes: 1100,
		core: 800
	}),
	makeWeek('2026-04-13', {
		chest: 4200,
		lats: 2000,
		upper_back: 1300,
		quads: 4100,
		hamstrings: 2300,
		front_delts: 1250,
		side_delts: 950,
		biceps: 1050,
		triceps: 1450,
		glutes: 1150,
		core: 900
	}),
	makeWeek('2026-04-20', {
		chest: 3900,
		lats: 2100,
		upper_back: 1400,
		quads: 4300,
		hamstrings: 2400,
		front_delts: 1300,
		side_delts: 1000,
		biceps: 1100,
		triceps: 1400,
		glutes: 1200,
		core: 900
	}),
	makeWeek('2026-04-27', {
		chest: 4400,
		lats: 2200,
		upper_back: 1400,
		quads: 4500,
		hamstrings: 2500,
		front_delts: 1350,
		side_delts: 1050,
		biceps: 1150,
		triceps: 1500,
		glutes: 1250,
		core: 1000
	})
]

const DAY_MS = 24 * 60 * 60 * 1000

const PR_DATA: PRRow[] = [
	{
		sessionId: 'wks_demo1',
		exerciseId: null,
		exerciseName: 'Overhead Press',
		weightKg: 60,
		reps: 6,
		e1rm: 71.5,
		deltaFromPrior: 0.9,
		startedAt: Date.now() - 14 * DAY_MS
	},
	{
		sessionId: 'wks_demo2',
		exerciseId: null,
		exerciseName: 'Romanian Deadlift',
		weightKg: 130,
		reps: 8,
		e1rm: 165.2,
		deltaFromPrior: 1.5,
		startedAt: Date.now() - 11 * DAY_MS
	},
	{
		sessionId: 'wks_demo3',
		exerciseId: null,
		exerciseName: 'Barbell Bench Press',
		weightKg: 102.5,
		reps: 5,
		e1rm: 119.4,
		deltaFromPrior: 2.1,
		startedAt: Date.now() - 8 * DAY_MS
	}
]

const STALLED_DATA: StalledRow[] = [
	{
		exerciseId: null,
		exerciseName: 'Lateral Raise',
		currentMaxE1rm: 18.6,
		lastSessionAt: Date.now() - 21 * DAY_MS,
		sessionsTracked: 4
	},
	{
		exerciseId: null,
		exerciseName: 'Triceps Rope Pushdown',
		currentMaxE1rm: 38.2,
		lastSessionAt: Date.now() - 14 * DAY_MS,
		sessionsTracked: 3
	}
]

// Heatmap mock — last ~10 weeks of training density.
function utcDateKey(ms: number): string {
	const d = new Date(ms)
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const HEATMAP_DATA: HeatmapRow[] = (() => {
	const out: HeatmapRow[] = []
	const now = Date.now()
	// Roughly every-other-day pattern with intensity variance.
	const pattern = [0, 18, 0, 14, 0, 10, 0, 22, 0, 16, 0, 12, 0, 8]
	for (let i = 0; i < 70; i++) {
		const count = pattern[i % pattern.length]
		if (count > 0) out.push({ date: utcDateKey(now - i * DAY_MS), workingSetCount: count, sessionCount: 1 })
	}
	return out
})()

const HISTORY_DATA: HistoryChartDatum[] = (() => {
	const points: Array<{ weight: number; reps: number; e1rm: number }> = [
		{ weight: 90, reps: 8, e1rm: 110 },
		{ weight: 92.5, reps: 8, e1rm: 113 },
		{ weight: 95, reps: 7, e1rm: 114 },
		{ weight: 95, reps: 8, e1rm: 115.5 },
		{ weight: 97.5, reps: 7, e1rm: 117 },
		{ weight: 97.5, reps: 8, e1rm: 118.5 },
		{ weight: 100, reps: 6, e1rm: 116 },
		{ weight: 100, reps: 7, e1rm: 119 },
		{ weight: 100, reps: 8, e1rm: 121.5 },
		{ weight: 102.5, reps: 6, e1rm: 119 },
		{ weight: 102.5, reps: 7, e1rm: 121.8 },
		{ weight: 102.5, reps: 5, e1rm: 119.4 }
	]
	const now = Date.now()
	return points.map((p, i) => ({
		sessionId: `wks_history_${i}`,
		startedAt: now - (points.length - 1 - i) * 5 * DAY_MS,
		e1rm: p.e1rm,
		topSet: { weightKg: p.weight, reps: p.reps, rpe: 8 },
		volume: p.weight * p.reps * 4
	}))
})()
