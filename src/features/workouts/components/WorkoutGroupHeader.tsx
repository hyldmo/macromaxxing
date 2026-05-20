import type { TypeIDString } from '@macromaxxing/db'
import type { FC, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '~/lib'

interface CycleItem {
	id: TypeIDString<'wkt'>
	name: string
}

interface WorkoutGroupHeaderProps {
	title: string
	titleHref?: string
	status?: ReactNode
	cycle?: CycleItem[]
	meta?: ReactNode
	detailed?: boolean
}

export const WorkoutGroupHeader: FC<WorkoutGroupHeaderProps> = ({
	title,
	titleHref,
	status,
	cycle,
	meta,
	detailed = false
}) => (
	<header className="space-y-1.5">
		<div className="flex items-baseline gap-2 border-edge border-b pb-1">
			{titleHref ? (
				<Link to={titleHref} className={cn('font-medium text-ink hover:underline')}>
					{title}
				</Link>
			) : (
				<h2 className="font-medium text-ink">{title}</h2>
			)}
			{status}
		</div>
		{detailed && cycle && cycle.length > 0 && (
			<ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-ink-muted text-xs tabular-nums">
				{cycle.map((item, i) => (
					<li key={item.id} className="flex items-center gap-2">
						<span className="text-ink-faint">{i + 1}.</span>
						<span className="text-ink">{item.name}</span>
						{i < cycle.length - 1 && <span className="text-ink-faint">→</span>}
					</li>
				))}
				{cycle.length > 1 && <li className="text-ink-faint italic">→ wraps</li>}
			</ol>
		)}
		{detailed && meta && <div className="font-mono text-ink-faint text-xs tabular-nums">{meta}</div>}
	</header>
)
