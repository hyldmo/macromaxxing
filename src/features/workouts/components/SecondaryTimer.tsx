import type { FC } from 'react'
import { cn, formatTimer } from '~/lib'
import { useElapsedTimer } from '../hooks/useElapsedTimer'

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
			{formatTimer(elapsedMs / 1000, { subseconds: true })}
			{label ? ` ${label}` : ''}
		</span>
	)
}
