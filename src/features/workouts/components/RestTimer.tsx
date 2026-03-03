import { Dumbbell } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '~/lib'
import { formatElapsed, useElapsedTimer } from '../hooks/useElapsedTimer'
import { useRestTimer } from '../RestTimerContext'

const SET_TYPE_COLORS = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
} as const

export const RestTimer: FC = () => {
	const { remaining, setType, isRunning, sessionId, startedAt, dismiss } = useRestTimer()
	const navigate = useNavigate()
	const elapsed = useElapsedTimer(!isRunning && startedAt ? startedAt : null)

	const goToTimer = () => {
		if (sessionId) navigate(`/workouts/sessions/${sessionId}/timer`)
	}

	// Active timer (counting down or overshot)
	if (isRunning && setType) {
		const overshot = remaining <= 0
		const abs = Math.abs(remaining)
		const minutes = Math.floor(abs / 60)
		const seconds = abs % 60
		const display = `${overshot ? '-' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`

		return (
			<div
				className={cn(
					'flex items-center gap-1.5 rounded-sm border border-edge px-2 py-1',
					overshot && 'animate-pulse'
				)}
			>
				<span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', SET_TYPE_COLORS[setType])}>
					{setType}
				</span>
				<button
					type="button"
					className={cn(
						'font-mono text-sm tabular-nums',
						overshot ? 'text-destructive' : 'text-ink',
						sessionId && 'hover:text-accent'
					)}
					onClick={goToTimer}
				>
					{display}
				</button>
				<button type="button" className="text-ink-faint text-xs hover:text-ink" onClick={dismiss}>
					×
				</button>
			</div>
		)
	}

	// Session active with timer activated — show elapsed time
	if (sessionId && startedAt) {
		return (
			<button
				type="button"
				className="flex items-center gap-1.5 rounded-sm border border-edge px-2 py-1 text-ink-faint hover:text-accent"
				onClick={goToTimer}
			>
				<Dumbbell className="size-3.5" />
				<span className="font-mono text-sm tabular-nums">{formatElapsed(elapsed)}</span>
			</button>
		)
	}

	// Session active but timer not yet activated — dumbbell only
	if (sessionId) {
		return (
			<button
				type="button"
				className="rounded-sm border border-edge p-1.5 text-ink-faint hover:text-accent"
				onClick={() => navigate(`/workouts/sessions/${sessionId}`)}
			>
				<Dumbbell className="size-4" />
			</button>
		)
	}

	return null
}
