import { startCase } from 'es-toolkit'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type TrendRow = RouterOutput['analytics']['weeklyTrend'][number]

export interface WeeklyTrendListProps {
	trend: TrendRow[]
}

export const WeeklyTrendList: FC<WeeklyTrendListProps> = ({ trend }) => {
	if (trend.length === 0) {
		return (
			<div className="py-4 text-center text-ink-faint text-sm">Not enough training in this window to compare</div>
		)
	}

	return (
		<div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
			{trend.map(row => {
				const delta = row.deltaSets
				const sign = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat'
				const deltaColor =
					sign === 'up' ? 'text-success' : sign === 'down' ? 'text-destructive' : 'text-ink-faint'
				const Icon = sign === 'up' ? ArrowUp : sign === 'down' ? ArrowDown : Minus
				return (
					<div
						key={row.muscleGroup}
						className="flex items-center gap-3 rounded-sm border border-edge bg-surface-0 px-3 py-2"
					>
						<div className="min-w-0 flex-1">
							<div className="font-medium text-ink text-sm">{startCase(row.muscleGroup)}</div>
							<div className="font-mono text-[11px] text-ink-faint tabular-nums">
								{row.currentSets.toFixed(1)} sets · prior {row.priorSets.toFixed(1)}
							</div>
						</div>
						<div className={cn('flex items-center gap-1 font-mono text-xs tabular-nums', deltaColor)}>
							<Icon className="size-3.5" />
							<span>
								{delta > 0 ? '+' : ''}
								{delta.toFixed(1)}
							</span>
						</div>
					</div>
				)
			})}
		</div>
	)
}
