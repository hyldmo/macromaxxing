import { Dumbbell } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn, formatTimer, SET_TYPE_STYLES } from '~/lib'
import { useElapsedTimer } from '../hooks/useElapsedTimer'
import { useWorkoutSessionStore } from '../store'

export const RestTimer: FC = () => {
	const sessionId = useWorkoutSessionStore(s => s.sessionId)
	const sessionStartedAt = useWorkoutSessionStore(s => s.sessionStartedAt)
	const rest = useWorkoutSessionStore(s => s.rest)
	const remaining = useWorkoutSessionStore(s => s.remaining)
	const dismissRest = useWorkoutSessionStore(s => s.dismissRest)
	const navigate = useNavigate()
	const isRunning = rest !== null
	const elapsed = useElapsedTimer(!isRunning && sessionStartedAt ? sessionStartedAt : null)

	const goToTimer = () => {
		if (sessionId) navigate(`/workouts/sessions/${sessionId}/timer`)
	}

	// Active timer (counting down or overshot)
	if (rest) {
		const overshot = remaining <= 0
		const display = formatTimer(remaining)

		return (
			<div
				className={cn(
					'flex items-center gap-1.5 rounded-sm border border-edge px-2 py-1',
					overshot && 'animate-pulse'
				)}
			>
				<span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', SET_TYPE_STYLES[rest.setType])}>
					{rest.setType}
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
				<button type="button" className="text-ink-faint text-xs hover:text-ink" onClick={dismissRest}>
					×
				</button>
			</div>
		)
	}

	// Session active with timer activated — show elapsed time
	if (sessionId && sessionStartedAt) {
		return (
			<button
				type="button"
				className="flex items-center gap-1.5 rounded-sm border border-edge px-2 py-1 text-ink-faint hover:text-accent"
				onClick={goToTimer}
			>
				<Dumbbell className="size-3.5" />
				<span className="font-mono text-sm tabular-nums">{formatTimer(elapsed / 1000)}</span>
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
