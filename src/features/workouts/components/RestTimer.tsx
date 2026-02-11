import { Dumbbell } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '~/lib/cn'
import { useRestTimer } from '../RestTimerContext'

const SET_TYPE_COLORS = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
} as const

export const RestTimer: FC = () => {
	const { remaining, setType, isRunning, isTransition, sessionId, dismiss } = useRestTimer()
	const navigate = useNavigate()

	const goToSession = () => {
		if (sessionId) navigate(`/workouts/sessions/${sessionId}`)
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
					'flex items-center gap-1.5 rounded-[--radius-sm] border border-edge px-2 py-1',
					overshot && 'animate-pulse'
				)}
			>
				<span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', SET_TYPE_COLORS[setType])}>
					{isTransition ? 'switch' : setType}
				</span>
				<button
					type="button"
					className={cn(
						'font-mono text-sm tabular-nums',
						overshot ? 'text-destructive' : 'text-ink',
						sessionId && 'hover:text-accent'
					)}
					onClick={goToSession}
				>
					{display}
				</button>
				<button type="button" className="text-ink-faint text-xs hover:text-ink" onClick={dismiss}>
					×
				</button>
			</div>
		)
	}

	// No timer, but session active — show nav link
	if (sessionId) {
		return (
			<button
				type="button"
				className="rounded-[--radius-sm] border border-edge p-1.5 text-ink-faint hover:text-accent"
				onClick={goToSession}
			>
				<Dumbbell className="size-4" />
			</button>
		)
	}

	return null
}
