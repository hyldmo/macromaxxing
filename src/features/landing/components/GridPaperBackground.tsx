import type { FC } from 'react'

export const GridPaperBackground: FC = () => (
	<div
		aria-hidden
		className="pointer-events-none absolute inset-0 opacity-[0.06]"
		style={{
			backgroundImage:
				'linear-gradient(to right, var(--color-ink) 1px, transparent 1px), linear-gradient(to bottom, var(--color-ink) 1px, transparent 1px)',
			backgroundSize: '48px 48px',
			maskImage:
				'radial-gradient(ellipse 80% 60% at 70% 30%, rgba(0,0,0,0.6), rgba(0,0,0,0.15) 60%, transparent 90%)'
		}}
	/>
)
