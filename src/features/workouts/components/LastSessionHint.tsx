import type { FC } from 'react'
import { cn, formatRecency } from '~/lib'

export interface LastSessionHintProps {
	lastSession: {
		startedAt: number
		workingSets: Array<{ weightKg: number; reps: number; rpe: number | null }>
		topE1rm: number
	} | null
	className?: string
}

const MAX_SETS_SHOWN = 5

/**
 * Compact "last time" hint shown above an exercise's set rows.
 * Bodyweight (all weights ≤ 0) renders reps-only. Long set lists are truncated to MAX_SETS_SHOWN.
 * Returns null when no prior session exists — empty state stays clean.
 */
export const LastSessionHint: FC<LastSessionHintProps> = ({ lastSession, className }) => {
	if (!lastSession || lastSession.workingSets.length === 0) return null

	const sets = lastSession.workingSets
	const truncated = sets.length > MAX_SETS_SHOWN
	const shown = truncated ? sets.slice(0, MAX_SETS_SHOWN) : sets
	const isBodyweight = sets.every(s => s.weightKg <= 0)

	const recency = formatRecency(Date.now() - lastSession.startedAt)

	let body: string
	if (isBodyweight) {
		body = `${shown.map(s => s.reps).join(', ')}${truncated ? ', …' : ''} reps`
	} else {
		// Group consecutive sets at the same weight: "80×8, 8, 6 · 75×10"
		const groups: Array<{ weight: number; reps: number[] }> = []
		for (const s of shown) {
			const last = groups.at(-1)
			if (last && last.weight === s.weightKg) {
				last.reps.push(s.reps)
			} else {
				groups.push({ weight: s.weightKg, reps: [s.reps] })
			}
		}
		const parts = groups.map(g => `${formatWeight(g.weight)}×${g.reps.join(', ')}`)
		body = `${parts.join(' · ')}${truncated ? ' · …' : ''}`
	}

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
