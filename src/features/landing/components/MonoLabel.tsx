import type { FC, ReactNode } from 'react'
import { cn } from '~/lib'

export interface MonoLabelProps {
	children: ReactNode
	className?: string
}

export const MonoLabel: FC<MonoLabelProps> = ({ children, className }) => (
	<span className={cn('font-mono text-[10px] text-ink-faint uppercase tracking-[0.25em]', className)}>
		{children}
	</span>
)
