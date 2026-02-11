import type { FC, ReactNode } from 'react'
import { cn } from '~/lib/cn'

export interface TooltipProps {
	content: ReactNode
	children: ReactNode
	className?: string
}

export const Tooltip: FC<TooltipProps> = ({ content, children, className }) => (
	<span className={cn('group/tooltip relative inline', className)}>
		{children}
		<span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-edge bg-surface-1 px-2 py-1 text-ink text-xs opacity-0 transition-opacity group-hover/tooltip:opacity-100">
			{content}
		</span>
	</span>
)
