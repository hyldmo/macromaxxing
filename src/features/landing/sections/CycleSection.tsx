import { ChevronRight, RotateCw } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { cn } from '~/lib'
import { MonoLabel, SectionShell } from '../components'

export const CycleSection: FC = () => (
	<SectionShell
		id="cycle"
		marker="§ 03 / Cycle"
		title="Programs that loop. Cues that stick."
		kicker="Pick a program. The dashboard cycles through it. Open any exercise for cues, pitfalls, and the rep that earned it."
	>
		<div className="grid gap-px overflow-hidden border border-edge bg-edge md:grid-cols-2">
			<CycleCard
				eyebrow="Programs"
				title="Named cycles, active by default"
				body="Group templates into a program — Push / Pull / Legs, Upper / Lower, whatever. Star one as active and the dashboard tells you what's next, by day-of-cycle, not by guess."
				visual={<ProgramCyclePreview />}
			/>
			<CycleCard
				eyebrow="Technique"
				title="The coach lives in the lift"
				body="Every exercise carries its own technique guide — description, cues to focus on, pitfalls to avoid. Curated for system lifts, editable on your own. One tap from the set you're about to perform."
				visual={<TechniqueGuide />}
			/>
		</div>
	</SectionShell>
)

interface CycleCardProps {
	eyebrow: string
	title: string
	body: string
	visual: ReactNode
}

const CycleCard: FC<CycleCardProps> = ({ eyebrow, title, body, visual }) => (
	<article className="flex flex-col bg-surface-0 p-8">
		<MonoLabel className="text-accent">{eyebrow}</MonoLabel>
		<h3 className="mt-3 font-display font-normal text-2xl leading-tight tracking-tight md:text-3xl">{title}</h3>
		<p className="mt-3 font-display text-base text-ink-muted leading-relaxed">{body}</p>
		<div className="mt-8 border-edge border-t pt-6">{visual}</div>
	</article>
)

// ---------------------------------------------------------------------------
// Program cycle preview — numbered list, 4 workouts, "up next" highlighted.
// Mirrors ProgramCyclePreview / Dashboard "Up next" surface.
// ---------------------------------------------------------------------------

const PROGRAM = {
	name: 'PPL · 6 day',
	workouts: [
		{ n: 1, name: 'Push A', status: 'done', meta: 'Apr 28 · 18 sets' },
		{ n: 2, name: 'Pull A', status: 'done', meta: 'Apr 30 · 16 sets' },
		{ n: 3, name: 'Legs A', status: 'done', meta: 'May 02 · 14 sets' },
		{ n: 4, name: 'Push B', status: 'next', meta: 'Up next · today' },
		{ n: 5, name: 'Pull B', status: 'queued', meta: 'In ~2 days' },
		{ n: 6, name: 'Legs B', status: 'queued', meta: 'In ~4 days' }
	]
} as const

const ProgramCyclePreview: FC = () => (
	<div className="space-y-4 font-mono">
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<MonoLabel className="text-accent">Active</MonoLabel>
				<span className="text-ink text-sm">{PROGRAM.name}</span>
			</div>
			<div className="flex items-center gap-1.5 text-[10px] text-ink-faint uppercase tracking-[0.2em]">
				<RotateCw className="size-3" />
				<span>Loops</span>
			</div>
		</div>
		<ol className="border border-edge">
			{PROGRAM.workouts.map((w, i) => (
				<li
					key={w.name}
					className={cn(
						'grid grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-3 text-sm',
						i !== 0 && 'border-edge border-t',
						w.status === 'next' && 'bg-accent/5'
					)}
				>
					<span
						className={cn(
							'inline-flex size-6 items-center justify-center border font-mono text-[11px] tabular-nums',
							w.status === 'next' ? 'border-accent text-accent' : 'border-edge text-ink-faint'
						)}
					>
						{w.n}
					</span>
					<div className="min-w-0">
						<div
							className={cn(
								'font-display text-base',
								w.status === 'done' && 'text-ink-muted',
								w.status === 'next' && 'text-ink',
								w.status === 'queued' && 'text-ink'
							)}
						>
							{w.name}
						</div>
						<div className="text-[10px] text-ink-faint">{w.meta}</div>
					</div>
					{w.status === 'next' ? (
						<span className="flex items-center gap-1 text-[10px] text-accent uppercase tracking-[0.2em]">
							Next <ChevronRight className="size-3" />
						</span>
					) : w.status === 'done' ? (
						<span className="text-[10px] text-success uppercase tracking-[0.2em]">Done</span>
					) : (
						<span className="text-[10px] text-ink-faint uppercase tracking-[0.2em]">Queued</span>
					)}
				</li>
			))}
		</ol>
		<div className="flex items-center justify-between border-edge border-t pt-3 text-[10px] text-ink-faint uppercase tracking-[0.2em]">
			<span>Day 4 of 6</span>
			<span>↻ Wraps to Push A</span>
		</div>
	</div>
)

// ---------------------------------------------------------------------------
// Technique guide — mirrors ExerciseGuideContent.tsx
// Curated cues + pitfalls for one lift, color-coded.
// ---------------------------------------------------------------------------

const GUIDE = {
	name: 'Barbell Bench Press',
	tag: 'Compound · Tier 1',
	description:
		'Horizontal press with a barbell. Drives the chest, front delts, and triceps. Set up tight: feet planted, shoulder blades pinned and depressed, slight arch through the upper back.',
	cues: [
		'Drive through midfoot — feet stay planted from setup to lockout',
		'Bar lands over the base of the palm, not the fingers',
		"Tuck elbows toward 70° on the descent — don't flare to 90°"
	],
	pitfalls: [
		'Bouncing the bar off the chest to clear sticking points',
		'Hips lifting off the bench on the heaviest attempt'
	]
} as const

const TechniqueGuide: FC = () => (
	<div className="space-y-5 font-mono">
		<header className="flex items-baseline justify-between">
			<div>
				<div className="font-display text-ink text-xl leading-tight md:text-2xl">{GUIDE.name}</div>
				<div className="mt-1 text-[10px] text-ink-faint uppercase tracking-[0.2em]">{GUIDE.tag}</div>
			</div>
			<span className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.2em]">Guide</span>
		</header>
		<p className="font-display text-ink-muted text-sm leading-relaxed">{GUIDE.description}</p>
		<section className="border-success/60 border-l-2 pl-4">
			<div className="mb-2 flex items-center gap-2 text-[10px] text-success uppercase tracking-[0.2em]">
				<span aria-hidden>⚡</span>
				<span>Cues</span>
			</div>
			<ul className="space-y-1.5 font-display text-ink text-sm leading-relaxed">
				{GUIDE.cues.map(c => (
					<li key={c} className="flex gap-2">
						<span aria-hidden className="text-success">
							·
						</span>
						<span>{c}</span>
					</li>
				))}
			</ul>
		</section>
		<section className="border-macro-fat/60 border-l-2 pl-4">
			<div className="mb-2 flex items-center gap-2 text-[10px] text-macro-fat uppercase tracking-[0.2em]">
				<span aria-hidden>⚠</span>
				<span>Pitfalls</span>
			</div>
			<ul className="space-y-1.5 font-display text-ink text-sm leading-relaxed">
				{GUIDE.pitfalls.map(p => (
					<li key={p} className="flex gap-2">
						<span aria-hidden className="text-macro-fat">
							·
						</span>
						<span>{p}</span>
					</li>
				))}
			</ul>
		</section>
	</div>
)
