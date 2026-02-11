import type { SetType } from '@macromaxxing/db'
import type { FC } from 'react'
import { cn } from '~/lib/cn'
import { useRestTimer } from '../RestTimerContext'
import { TRAINING_DEFAULTS } from '../utils/sets'

const SET_TYPE_COLORS = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
} as const

const SET_TYPE_LABELS: Record<SetType, string> = {
	warmup: 'WU',
	working: 'W',
	backoff: 'BO'
}

export const RestTimer: FC = () => {
	const { remaining, total, setType, sessionGoal, start, extend, dismiss } = useRestTimer()

	const active = setType && (remaining > 0 || total > 0)

	// Show when timer is active OR when on a session page
	if (!(active || sessionGoal)) return null

	// Active countdown
	if (active && setType) {
		const done = remaining === 0
		const minutes = Math.floor(remaining / 60)
		const seconds = remaining % 60
		const display = `${minutes}:${seconds.toString().padStart(2, '0')}`

		return (
			<div
				className={cn(
					'flex items-center gap-1.5 rounded-[--radius-sm] border border-edge px-2 py-1',
					done && 'animate-pulse'
				)}
			>
				<span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', SET_TYPE_COLORS[setType])}>
					{setType}
				</span>
				<span className={cn('font-mono text-sm tabular-nums', done ? 'text-accent' : 'text-ink')}>
					{done ? 'Done' : display}
				</span>
				{!done && (
					<button
						type="button"
						className="rounded-[--radius-sm] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted hover:text-ink"
						onClick={() => extend(30)}
					>
						+30s
					</button>
				)}
				<button type="button" className="text-ink-faint text-xs hover:text-ink" onClick={dismiss}>
					×
				</button>
			</div>
		)
	}

	// Idle — show quick-start buttons
	if (!sessionGoal) return null
	const durations = TRAINING_DEFAULTS[sessionGoal].rest

	return (
		<div className="flex items-center gap-0.5 rounded-[--radius-sm] border border-edge px-1.5 py-1">
			<span className="mr-1 font-mono text-[10px] text-ink-faint">Rest</span>
			{(['warmup', 'working', 'backoff'] as const).map(st => (
				<button
					key={st}
					type="button"
					className={cn(
						'rounded-[--radius-sm] px-1.5 py-0.5 font-mono text-[10px] transition-colors',
						SET_TYPE_COLORS[st],
						'hover:opacity-80'
					)}
					onClick={() => start(durations[st], st)}
				>
					{SET_TYPE_LABELS[st]} {durations[st]}s
				</button>
			))}
		</div>
	)
}
