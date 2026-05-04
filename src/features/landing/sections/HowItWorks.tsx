import type { FC } from 'react'
import { BarcodeStrip, SectionShell } from '../components'

const LOG_STEPS: Array<{ title: string; body: string; meta: string }> = [
	{
		title: 'Catalog',
		body: 'Add recipes and ingredients. AI fills macros if USDA does not have them. Set portion size. See kcal per gram, per portion, per batch.',
		meta: '~30 s per recipe'
	},
	{
		title: 'Plan',
		body: 'Create a meal plan. Add recipes to inventory with portion count. Allocate portions across Mon → Sun slots. Cook once, eat all week.',
		meta: 'Inventory-based'
	},
	{
		title: 'Lift',
		body: 'Build workout templates from system or custom exercises. Start a session and planned sets pre-fill. Tap to confirm each set.',
		meta: 'Checklist-driven'
	},
	{
		title: 'Review',
		body: 'Body map heats by volume. Session review flags drift between planned and actual. Update targets in one tap.',
		meta: 'Divergence-aware'
	}
]

export const HowItWorks: FC = () => (
	<SectionShell
		id="log"
		marker="§ 04 / Log"
		title="The loop."
		kicker="Four steps. Repeat weekly. The app gets out of the way."
		variant="alt"
	>
		<div className="grid gap-6 md:grid-cols-2">
			{LOG_STEPS.map((s, i) => (
				<article
					key={s.title}
					className="group relative flex flex-col border border-edge bg-surface-0 p-8 transition-colors hover:border-accent/50"
				>
					<div className="flex items-baseline justify-between font-mono text-[10px] text-ink-faint uppercase tracking-[0.25em]">
						<span className="text-accent">Step {String(i + 1).padStart(2, '0')}</span>
						<span>{s.meta}</span>
					</div>
					<h3 className="mt-5 font-display font-normal text-4xl text-ink leading-[0.95] tracking-tight md:text-5xl">
						{s.title}
					</h3>
					<p className="mt-6 flex-1 font-display text-base text-ink-muted leading-relaxed md:text-lg">
						{s.body}
					</p>
					<div className="mt-8 flex items-center gap-3 border-edge border-t pt-4 font-mono text-[10px] text-ink-muted uppercase tracking-[0.2em]">
						<BarcodeStrip seed={s.title} />
						<span className="ml-auto">{`wk_${String(i + 1).padStart(2, '0')}`}</span>
					</div>
				</article>
			))}
		</div>
	</SectionShell>
)
