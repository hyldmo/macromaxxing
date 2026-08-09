import type { FC } from 'react'
import { cn, estimated1RM, formatRecency } from '~/lib'
import { METRIC_UNIT } from '~/lib/workouts/constants'

export interface LastSessionHintProps {
	lastSession: {
		startedAt: number
		workingSets: Array<{ weightKg: number; reps: number; rpe: number | null }>
		topE1rm: number
	} | null
	className?: string
}

/**
 * Compact "last time" hint shown above an exercise's set rows: the BEST working set
 * of that session, "10kg×12 reps". Best = highest e1RM, reps breaking a tie — which is
 * also what carries the bodyweight case, where every set estimates to 0.
 *
 * A full set list ("10kg×11, 12 reps") read as one number pair rather than two sets, and
 * the rest of the sets are a scroll away on the session anyway. Returns null when no prior
 * session exists — empty state stays clean.
 */
export const LastSessionHint: FC<LastSessionHintProps> = ({ lastSession, className }) => {
	if (!lastSession || lastSession.workingSets.length === 0) return null

	const best = lastSession.workingSets.reduce((a, b) => {
		const [ae, be] = [estimated1RM(a.weightKg, a.reps), estimated1RM(b.weightKg, b.reps)]
		return be > ae || (be === ae && b.reps > a.reps) ? b : a
	})

	const recency = formatRecency(Date.now() - lastSession.startedAt)
	const body =
		best.weightKg > 0
			? `${formatWeight(best.weightKg)}${METRIC_UNIT.weight}×${best.reps} reps`
			: `${best.reps} reps`

	return (
		<div className={cn('font-mono text-[10px] text-ink-faint tabular-nums', className)}>
			last: {body} · {recency}
		</div>
	)
}

/** 1 decimal max, no trailing zeros: 80 → "80", 82.5 → "82.5". */
function formatWeight(kg: number): string {
	const rounded = Math.round(kg * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
