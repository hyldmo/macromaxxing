import type { FC, ReactNode } from 'react'
import { cn } from '~/lib'

export interface SectionShellProps {
	id?: string
	marker: string
	title: string
	kicker?: string
	children: ReactNode
	variant?: 'base' | 'alt'
}

export const SectionShell: FC<SectionShellProps> = ({ id, marker, title, kicker, children, variant = 'base' }) => (
	<section
		id={id}
		className={cn(
			'relative scroll-mt-14 border-edge border-b',
			variant === 'alt' ? 'bg-surface-1' : 'bg-surface-0'
		)}
	>
		<div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
			<SectionHeading marker={marker} title={title} kicker={kicker} />
			<div className="mt-12 md:mt-16">{children}</div>
		</div>
	</section>
)

const SectionHeading: FC<{ marker: string; title: string; kicker?: string }> = ({ marker, title, kicker }) => (
	<header className="relative">
		<div className="mb-6 flex items-center gap-4">
			<span className="font-mono text-accent text-xs uppercase tracking-[0.3em]">{marker}</span>
			<span className="h-px flex-1 bg-edge" />
		</div>
		<h2 className="font-display font-light text-4xl leading-[0.95] tracking-tight md:text-6xl">{title}</h2>
		{kicker && (
			<p className="mt-4 max-w-xl font-display text-base text-ink-muted leading-relaxed md:text-lg">{kicker}</p>
		)}
	</header>
)
