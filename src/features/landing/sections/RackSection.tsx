import type { MuscleGroup } from '@macromaxxing/db'
import type { FC } from 'react'
import { BodyMap } from '~/features/workouts/components/BodyMap'
import { cn } from '~/lib'
import { MonoLabel, SectionShell } from '../components'

export const RackSection: FC = () => (
	<SectionShell
		id="rack"
		marker="§ 02 / Rack"
		title="Training logged rep for rep."
		kicker="Templates pre-fill planned sets. Tap to confirm. Body map heats up with volume. Rest timer knows how hard you just worked."
		variant="alt"
	>
		<div className="grid gap-12 md:grid-cols-5 md:gap-16">
			<div className="md:col-span-2">
				<RackBodyMap />
				<div className="mt-6 flex items-baseline justify-between border-edge border-t pt-4">
					<MonoLabel>Last 14 days · volume</MonoLabel>
					<span className="font-mono text-ink text-sm tabular-nums">183,420 kg</span>
				</div>
			</div>
			<div className="md:col-span-3">
				<RackFeatureList />
			</div>
		</div>
	</SectionShell>
)

const MUSCLE_VOLUMES: Array<[MuscleGroup, number]> = [
	['chest', 0.9],
	['front_delts', 0.75],
	['side_delts', 0.65],
	['rear_delts', 0.35],
	['triceps', 0.8],
	['biceps', 0.45],
	['forearms', 0.2],
	['lats', 0.55],
	['upper_back', 0.5],
	['quads', 0.85],
	['hamstrings', 0.4],
	['glutes', 0.6],
	['calves', 0.25],
	['core', 0.5]
]

const HEAT_STOPS = [0.1, 0.25, 0.45, 0.65, 0.85]

const RackBodyMap: FC = () => (
	<div className="border border-edge bg-surface-0 p-6">
		<div className="mb-4 flex items-baseline justify-between">
			<MonoLabel>Coverage map</MonoLabel>
			<span className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.2em]">14 / 14 muscles</span>
		</div>
		<BodyMap muscleVolumes={new Map(MUSCLE_VOLUMES)} sex="male" />
		<div className="mt-5 flex items-center gap-3 border-edge border-t pt-3 font-mono text-[10px] text-ink-muted uppercase tracking-[0.15em]">
			<span>Low</span>
			<div className="flex flex-1 items-center">
				{HEAT_STOPS.map(v => (
					<div
						key={v}
						className="h-1.5 flex-1"
						style={{ backgroundColor: `oklch(0.7 ${0.05 + v * 0.15} 55)` }}
					/>
				))}
			</div>
			<span>High</span>
		</div>
	</div>
)

const RACK_FEATURES: Array<{ eyebrow: string; title: string; body: string; meta: string }> = [
	{
		eyebrow: 'A',
		title: 'Templates that pre-fill',
		body: 'Build once with sets, reps, target weight, and set modes (working / warmup / backoff / full). Every session starts with planned sets ready to confirm.',
		meta: 'working · warmup · backoff · full'
	},
	{
		eyebrow: 'B',
		title: 'Supersets as interleaved rounds',
		body: 'Group exercises with supersetGroup. The UI renders rounds instead of two lists, with transition timers between movements.',
		meta: 'round 1 / 3 · transition 15 s'
	},
	{
		eyebrow: 'C',
		title: 'Fatigue-aware rest timer',
		body: 'Rest duration = reps × 4 × goal × tier modifier. Squats get longer recovery than curls. The timer persists across pages and survives a refresh.',
		meta: 'tier 1 · compound · +30 s'
	},
	{
		eyebrow: 'D',
		title: 'Body map heat from real volume',
		body: 'Each exercise maps to muscle groups with intensity (0.0–1.0). Sessions aggregate into a coverage map that shows exactly what you trained — and what you neglected.',
		meta: '14 muscle groups · intensity-weighted'
	},
	{
		eyebrow: 'E',
		title: 'Strength standards',
		body: 'Bench → incline DB. Squat → leg extension. Curated compound-to-isolation ratios flag when an accessory lift is out of proportion with the main lift.',
		meta: 'ratios enforced at the model layer'
	}
]

const RackFeatureList: FC = () => (
	<ol className="border border-edge">
		{RACK_FEATURES.map((f, i) => (
			<li
				key={f.title}
				className={cn(
					'group relative flex gap-6 px-6 py-6 transition-colors hover:bg-surface-0',
					i !== 0 && 'border-edge border-t'
				)}
			>
				<span className="w-8 shrink-0 font-mono text-accent text-xs uppercase tracking-[0.25em]">
					{f.eyebrow}
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="font-display font-normal text-xl leading-tight md:text-2xl">{f.title}</h3>
					<p className="mt-2 font-display text-base text-ink-muted leading-relaxed">{f.body}</p>
					<div className="mt-3 font-mono text-[10px] text-ink-faint uppercase tracking-[0.2em]">{f.meta}</div>
				</div>
			</li>
		))}
	</ol>
)
