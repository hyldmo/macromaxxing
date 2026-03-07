import { TrendingUp } from 'lucide-react'
import type { FC } from 'react'
import type { E1rmStat } from '~/lib'

export interface E1rmTableProps {
	stats: E1rmStat[]
}

export const E1rmTable: FC<E1rmTableProps> = ({ stats }) => (
	<>
		<div className="mb-2 flex items-center justify-end gap-1.5 text-accent">
			<TrendingUp className="size-3.5 text-ink-faint" />
			<span className="text-xs">Estimated 1RM</span>
		</div>
		<div className="space-y-1.5">
			{stats.map(s => (
				<div key={s.name} className="flex items-baseline justify-between gap-2">
					<span className="min-w-0 truncate text-ink text-sm">{s.name}</span>
					<div className="flex shrink-0 items-baseline gap-2 font-mono text-[11px] tabular-nums">
						<span className="text-ink-faint">
							{s.weightKg}kg × {s.reps}
						</span>
						<span className="font-semibold text-accent">{s.e1rm.toFixed(0)}kg</span>
					</div>
				</div>
			))}
		</div>
	</>
)
