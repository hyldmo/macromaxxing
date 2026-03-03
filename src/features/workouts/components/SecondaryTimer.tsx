import type { FC } from 'react'
import { cn } from '~/lib'
import { formatElapsed, useElapsedTimer } from '../hooks/useElapsedTimer'

export interface SecondaryTimerProps {
	startedAt: number | null
	label?: string
	className?: string
}

export const SecondaryTimer: FC<SecondaryTimerProps> = ({ startedAt, label, className }) => {
	const elapsedMs = useElapsedTimer(startedAt)
	if (!startedAt) return null
	return (
		<span className={cn('font-mono text-ink-faint text-xs tabular-nums', className)}>
			{formatElapsed(elapsedMs)}
			{label ? ` ${label}` : ''}
		</span>
	)
}
