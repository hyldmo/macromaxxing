import { SignUpButton } from '@clerk/clerk-react'
import { ArrowRight } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '~/components/ui'
import { cn } from '~/lib'
import { GridPaperBackground, MonoLabel } from '../components'

export const Hero: FC = () => (
	<section className="relative overflow-hidden border-edge border-b">
		<GridPaperBackground />
		<div className="relative mx-auto max-w-7xl px-4 pt-16">
			<SpecStrip />
		</div>
		<div className="relative mx-auto max-w-6xl px-6 pb-20 md:pb-28">
			<div className="mt-12 grid gap-16 md:mt-20 md:grid-cols-12 md:gap-10">
				<div className="md:col-span-7">
					<HeroHeadline />
					<p className="mt-10 max-w-lg font-display text-ink-muted text-lg leading-relaxed md:text-xl">
						A precision log for meal prep and strength training. Built for lifters who measure what they eat
						and what they lift.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-6">
						<SignUpButton mode="modal">
							<Button size="lg" className="h-12 px-6 font-display text-base">
								Start tracking
								<ArrowRight className="size-4" />
							</Button>
						</SignUpButton>
						<a
							href="#plate"
							className="group flex items-center gap-2 font-mono text-ink-muted text-xs uppercase tracking-[0.25em] transition-colors hover:text-ink"
						>
							See the log
							<span className="transition-transform group-hover:translate-y-0.5">↓</span>
						</a>
					</div>
					<HeroFootnotes />
				</div>
				<div className="md:col-span-5">
					<div className="flex flex-col gap-5 md:sticky md:top-20">
						<NutritionFactsPanel />
						<TrainingFactsPanel />
					</div>
				</div>
			</div>
		</div>
	</section>
)

const HeroHeadline: FC = () => (
	<h1 className="-mx-0.5 font-display font-light text-[56px] text-ink leading-[0.92] tracking-[-0.02em] md:text-[112px]">
		<span className="block animate-rise">Track every</span>
		<span className="block animate-rise italic" style={{ animationDelay: '120ms', color: 'var(--color-accent)' }}>
			gram.
		</span>
		<span className="mt-2 block animate-rise" style={{ animationDelay: '260ms' }}>
			Log every
		</span>
		<span className="block animate-rise italic" style={{ animationDelay: '380ms', color: 'var(--color-accent)' }}>
			rep.
		</span>
	</h1>
)

const SpecStrip: FC = () => (
	<div className="flex items-center gap-4 border-edge border-y py-2 font-mono text-[10px] text-ink-faint uppercase tracking-[0.2em]">
		<span className="text-accent">§ {import.meta.env.VITE_APP_VERSION}</span>
		<span className="h-3 w-px bg-edge" />
		<span className="hidden md:inline">Nutrition + Training Log</span>
		<span className="hidden h-3 w-px bg-edge md:inline-block" />
		<span>Est 2025</span>
		<span className="h-3 w-px bg-edge" />
		<span className="hidden sm:inline">Serial 0001A</span>
		<span className="ml-auto hidden items-center gap-2 sm:flex">
			<span className="size-1.5 animate-pulse rounded-full bg-success" />
			<span>Live</span>
		</span>
	</div>
)

const HeroFootnotes: FC = () => (
	<div className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-edge border-t pt-6 font-mono text-[10px] text-ink-muted uppercase tracking-[0.15em]">
		<div>
			<div className="text-ink text-lg tabular-nums tracking-normal">14,328</div>
			<div className="mt-1">USDA foods indexed</div>
		</div>
		<div>
			<div className="text-ink text-lg tabular-nums tracking-normal">14</div>
			<div className="mt-1">Muscle groups tracked</div>
		</div>
		<div>
			<div className="text-ink text-lg tabular-nums tracking-normal">0.1 g</div>
			<div className="mt-1">Macro resolution</div>
		</div>
	</div>
)

const NutritionFactsPanel: FC = () => (
	<article className="relative border-4 border-ink/90 bg-surface-0 p-4 font-mono text-ink md:p-5">
		<div className="flex items-baseline justify-between">
			<span className="font-black font-display text-[30px] text-ink leading-none tracking-tight md:text-[34px]">
				Nutrition Facts
			</span>
			<span className="font-mono text-[9px] text-ink-faint uppercase tracking-[0.2em]">rcp_01</span>
		</div>
		<div className="mt-1 flex justify-between text-[11px]">
			<span className="text-ink-muted">Batch yield</span>
			<span className="font-semibold">6 portions</span>
		</div>
		<div className="mt-0.5 flex justify-between text-[11px]">
			<span className="text-ink-muted">Serving size</span>
			<span className="font-semibold tabular-nums">1 portion · 285 g</span>
		</div>
		<div className="my-2 h-[10px] bg-ink/90" />
		<MonoLabel>Amount per portion</MonoLabel>
		<div className="mt-1 flex items-end justify-between">
			<span className="font-black font-display text-3xl leading-none">Calories</span>
			<span className="font-black font-mono text-[44px] text-macro-kcal tabular-nums leading-none">612</span>
		</div>
		<div className="my-2 h-[3px] bg-ink/90" />
		<div className="flex justify-end text-[10px] text-ink-muted uppercase tracking-[0.15em]">% Daily Intake</div>
		<NutritionRow label="Total Fat" value="22 g" pct="28%" accent="text-macro-fat" />
		<NutritionRow label="Total Carbs" value="58 g" pct="21%" accent="text-macro-carbs" />
		<NutritionRow label="Dietary Fiber" value="8 g" pct="28%" accent="text-macro-fiber" indent />
		<NutritionRow label="Protein" value="52 g" pct="40%" accent="text-macro-protein" emphasised />
		<div className="my-2 h-[10px] bg-ink/90" />
		<MonoLabel className="mb-1 block">Ingredients</MonoLabel>
		<p className="text-[11px] text-ink-muted leading-snug">
			Chicken thigh, jasmine rice, broccoli florets, sesame oil, soy, fresh ginger, garlic, chili flake.
		</p>
	</article>
)

const NutritionRow: FC<{
	label: string
	value: string
	pct: string
	accent: string
	indent?: boolean
	emphasised?: boolean
}> = ({ label, value, pct, accent, indent, emphasised }) => (
	<div
		className={cn(
			'flex items-baseline justify-between border-ink/20 border-b py-1 text-[13px] last:border-b-0',
			emphasised && 'font-semibold'
		)}
	>
		<span className={cn(indent && 'pl-4')}>
			<span className={cn('inline-block size-1.5 translate-y-[-2px]', accent, 'mr-2 bg-current')} />
			{label}
			<span className="ml-2 font-mono text-[11px] text-ink-muted tabular-nums">{value}</span>
		</span>
		<span className="font-mono tabular-nums">{pct}</span>
	</div>
)

const TrainingFactsPanel: FC = () => (
	<article className="relative border-4 border-ink/90 bg-surface-0 p-4 font-mono text-ink md:p-5">
		<div className="flex items-baseline justify-between">
			<span className="font-black font-display text-[30px] text-ink leading-none tracking-tight md:text-[34px]">
				Training Facts
			</span>
			<span className="font-mono text-[9px] text-ink-faint uppercase tracking-[0.2em]">wks_07</span>
		</div>
		<div className="mt-1 flex justify-between text-[11px]">
			<span className="text-ink-muted">Session</span>
			<span className="font-semibold">Push A · 58 min</span>
		</div>
		<div className="mt-0.5 flex justify-between text-[11px]">
			<span className="text-ink-muted">Total volume</span>
			<span className="font-semibold tabular-nums">14,280 kg</span>
		</div>
		<div className="my-2 h-[10px] bg-ink/90" />
		<MonoLabel>Working sets logged</MonoLabel>
		<div className="mt-1 flex items-end justify-between">
			<span className="font-black font-display text-3xl leading-none">Loaded</span>
			<span className="font-black font-mono text-[44px] text-accent tabular-nums leading-none">18</span>
		</div>
		<div className="my-2 h-[3px] bg-ink/90" />
		<div className="flex justify-end text-[10px] text-ink-muted uppercase tracking-[0.15em]">
			Sets × Reps · e1RM
		</div>
		<ExerciseRow name="Bench Press" sets="4 × 8" load="100 kg" e1rm="124" />
		<ExerciseRow name="Incline DB" sets="3 × 10" load="32 kg" e1rm="42" />
		<ExerciseRow name="Shoulder Press" sets="3 × 12" load="52 kg" e1rm="74" />
		<ExerciseRow name="Lateral Raise" sets="4 × 15" load="12 kg" e1rm="18" />
		<ExerciseRow name="Triceps Rope" sets="3 × 12" load="26 kg" e1rm="36" />
		<div className="my-2 h-[10px] bg-ink/90" />
		<MonoLabel className="mb-1 block">Muscles loaded</MonoLabel>
		<p className="text-[11px] text-ink-muted leading-snug">Chest, front delts, side delts, triceps, core.</p>
	</article>
)

const ExerciseRow: FC<{ name: string; sets: string; load: string; e1rm: string }> = ({ name, sets, load, e1rm }) => (
	<div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-ink/20 border-b py-1 text-[12px] last:border-b-0">
		<span>{name}</span>
		<span className="font-mono text-[11px] text-ink-muted tabular-nums">
			{sets} · {load}
		</span>
		<span className="w-10 text-right font-mono tabular-nums">{e1rm}</span>
	</div>
)
