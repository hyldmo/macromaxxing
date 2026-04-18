import type { FC } from 'react'

const RAIL_ITEMS = [
	['14,328', 'USDA foods indexed'],
	['14', 'Muscle groups'],
	['4', 'Fatigue tiers'],
	['0.1 g', 'Macro resolution'],
	['AES-GCM', 'BYOK key storage'],
	['FTS5', 'Search engine'],
	['MCP', 'Server exposed'],
	['PWA', 'Offline-first'],
	['D1', 'SQLite at the edge'],
	['R2', 'Image storage'],
	['3', 'AI providers'],
	['∞', 'Recipes per user']
] as const

export const NumbersRail: FC = () => {
	const looped = [...RAIL_ITEMS, ...RAIL_ITEMS].map(([num, label], i) => ({
		num,
		label,
		key: `${label}-${i < RAIL_ITEMS.length ? 'a' : 'b'}`
	}))
	return (
		<section className="border-edge border-b bg-surface-0">
			<div className="group relative overflow-hidden py-4">
				<div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface-0 to-transparent" />
				<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface-0 to-transparent" />
				<div className="flex w-max animate-marquee items-center gap-10 font-mono text-sm group-hover:[animation-play-state:paused]">
					{looped.map(item => (
						<div key={item.key} className="flex items-baseline gap-3 whitespace-nowrap">
							<span className="font-semibold text-ink text-lg tabular-nums">{item.num}</span>
							<span className="text-[11px] text-ink-muted uppercase tracking-[0.2em]">{item.label}</span>
							<span className="ml-6 text-accent">·</span>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}
