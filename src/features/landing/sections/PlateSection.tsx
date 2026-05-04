import type { FC, ReactNode } from 'react'
import { cn } from '~/lib'
import { MonoLabel, SectionShell } from '../components'

export const PlateSection: FC = () => (
	<SectionShell
		id="plate"
		marker="§ 01 / Plate"
		title="Meals tracked to the gram."
		kicker="Recipes with ingredients, portion sizes, subrecipes, and cooked weight. Macros scale with everything."
	>
		<div className="grid gap-px overflow-hidden border border-edge bg-edge md:grid-cols-3">
			<PlateCard
				eyebrow="Recipe"
				title="Gram-accurate math"
				body="Ingredients in, macros out. Per-100 g, per-portion, per-batch. Subrecipes compose. Cooked weight adjusts density on the fly."
				visual={<MacroStackDemo />}
			/>
			<PlateCard
				eyebrow="Lookup"
				title="Three sources, one box"
				body="Local USDA database first. USDA FoodData Central next. Your AI provider last. Barcode scan. Density for scoops, tbsps, pieces."
				visual={<LookupDemo />}
			/>
			<PlateCard
				eyebrow="Plan"
				title="The week, allocated"
				body="Create a plan. Add recipes to its inventory. Drop portions into Mon → Sun slots. Over-allocate and we warn you — never block you."
				visual={<PlannerDemo />}
			/>
		</div>
	</SectionShell>
)

const PlateCard: FC<{ eyebrow: string; title: string; body: string; visual: ReactNode }> = ({
	eyebrow,
	title,
	body,
	visual
}) => (
	<article className="flex flex-col bg-surface-0 p-8">
		<MonoLabel className="text-accent">{eyebrow}</MonoLabel>
		<h3 className="mt-3 font-display font-normal text-2xl leading-tight tracking-tight md:text-3xl">{title}</h3>
		<p className="mt-3 flex-1 font-display text-base text-ink-muted leading-relaxed">{body}</p>
		<div className="mt-8 border-edge border-t pt-6">{visual}</div>
	</article>
)

const MacroStackDemo: FC = () => (
	<div className="space-y-3 font-mono">
		<div className="flex items-baseline justify-between">
			<MonoLabel>Per 100 g raw</MonoLabel>
			<span className="text-ink text-sm tabular-nums">214 kcal</span>
		</div>
		<MacroStackBar protein={35} carbs={40} fat={20} fiber={5} />
		<div className="mt-6 flex items-baseline justify-between">
			<MonoLabel>Per portion · 285 g</MonoLabel>
			<span className="text-ink text-sm tabular-nums">612 kcal</span>
		</div>
		<MacroStackBar protein={38} carbs={38} fat={19} fiber={5} />
		<div className="mt-6 flex items-baseline justify-between">
			<MonoLabel>Per batch · 6 portions</MonoLabel>
			<span className="text-ink text-sm tabular-nums">3,672 kcal</span>
		</div>
		<MacroStackBar protein={38} carbs={38} fat={19} fiber={5} />
	</div>
)

const MacroStackBar: FC<{ protein: number; carbs: number; fat: number; fiber: number }> = ({
	protein,
	carbs,
	fat,
	fiber
}) => (
	<div className="flex h-2 w-full overflow-hidden border border-edge">
		<div style={{ width: `${protein}%` }} className="bg-macro-protein" />
		<div style={{ width: `${carbs}%` }} className="bg-macro-carbs" />
		<div style={{ width: `${fat}%` }} className="bg-macro-fat" />
		<div style={{ width: `${fiber}%` }} className="bg-macro-fiber" />
	</div>
)

const LookupDemo: FC = () => (
	<div className="space-y-2 font-mono text-xs">
		<div className="flex items-center gap-2 border border-edge bg-surface-1 px-3 py-2">
			<span className="text-accent">›</span>
			<span className="text-ink">chicken thigh</span>
			<span className="ml-auto text-ink-faint">↵</span>
		</div>
		<LookupHit source="USDA" name="Chicken, thigh, raw" meta="170 kcal · 17 g P · 0 g C · 11 g F" />
		<LookupHit source="USDA" name="Chicken, thigh, roasted" meta="209 kcal · 26 g P · 0 g C · 11 g F" />
		<LookupHit source="AI" name="Chicken thigh · skinless" meta="119 kcal · 21 g P · 0 g C · 4 g F" />
		<div className="mt-4 flex items-center gap-4 text-[10px] text-ink-faint uppercase tracking-[0.2em]">
			<span>Local DB</span>
			<span>→</span>
			<span>USDA API</span>
			<span>→</span>
			<span className="text-accent">AI</span>
		</div>
	</div>
)

const LookupHit: FC<{ source: string; name: string; meta: string }> = ({ source, name, meta }) => (
	<div className="grid grid-cols-[auto_1fr] gap-x-3 border-edge border-b pb-2 last:border-b-0">
		<span className="font-mono text-[9px] text-accent uppercase tracking-[0.25em]">{source}</span>
		<div>
			<div className="text-ink">{name}</div>
			<div className="text-[11px] text-ink-muted tabular-nums">{meta}</div>
		</div>
	</div>
)

const PlannerDemo: FC = () => {
	const days = [
		{ label: 'M', id: 'mon' },
		{ label: 'T', id: 'tue' },
		{ label: 'W', id: 'wed' },
		{ label: 'T', id: 'thu' },
		{ label: 'F', id: 'fri' },
		{ label: 'S', id: 'sat' },
		{ label: 'S', id: 'sun' }
	]
	const slots: Array<{ day: number; name: string; portions: number }> = [
		{ day: 0, name: 'Teriyaki Bowl', portions: 2 },
		{ day: 0, name: 'Overnight Oats', portions: 1 },
		{ day: 1, name: 'Teriyaki Bowl', portions: 1 },
		{ day: 1, name: 'Yogurt Stack', portions: 1 },
		{ day: 2, name: 'Teriyaki Bowl', portions: 1 },
		{ day: 3, name: 'Sheet-Pan Salmon', portions: 2 },
		{ day: 4, name: 'Sheet-Pan Salmon', portions: 1 },
		{ day: 4, name: 'Yogurt Stack', portions: 1 },
		{ day: 5, name: 'Steak & Potatoes', portions: 2 },
		{ day: 6, name: 'Leftovers', portions: 1 }
	]
	return (
		<div className="font-mono text-[10px]">
			<div className="grid grid-cols-7 border border-edge">
				{days.map((d, i) => (
					<div
						key={d.id}
						className={cn(
							'border-edge border-r px-1.5 py-1 text-center text-ink-muted uppercase tracking-[0.2em] last:border-r-0',
							i === 2 && 'bg-accent/10 text-accent'
						)}
					>
						{d.label}
					</div>
				))}
				{days.map((d, day) => (
					<div
						key={`${d.id}-cell`}
						className={cn(
							'min-h-[72px] border-edge border-t border-r p-1 last:border-r-0',
							day === 2 && 'bg-accent/5'
						)}
					>
						{slots
							.filter(s => s.day === day)
							.map(s => (
								<div
									key={`${d.id}-${s.name}-${s.portions}`}
									className="mb-1 truncate border-edge border-l-2 bg-surface-1 px-1 py-0.5 text-[8px] text-ink last:mb-0"
								>
									{s.portions}× {s.name}
								</div>
							))}
					</div>
				))}
			</div>
			<div className="mt-3 flex items-baseline justify-between">
				<MonoLabel>Week total</MonoLabel>
				<span className="text-ink tabular-nums">12,640 kcal · 1,120 g P</span>
			</div>
		</div>
	)
}
