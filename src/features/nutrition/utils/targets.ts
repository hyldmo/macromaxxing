/** How far past a target counts as overshooting rather than hitting it. */
const TOLERANCE = 0.05

export type TargetStatus = 'under' | 'on' | 'over'

/** Where an actual value sits relative to its target, within a ±5% band. */
export function targetStatus(actual: number, target: number): TargetStatus {
	if (target <= 0) return 'under'
	if (actual > target * (1 + TOLERANCE)) return 'over'
	if (actual >= target * (1 - TOLERANCE)) return 'on'
	return 'under'
}

/** Signed difference, or '' when it rounds to nothing worth showing. */
export function targetDelta(actual: number, target: number): string {
	const diff = Math.round(actual - target)
	if (diff === 0) return ''
	return diff > 0 ? `+${diff}` : String(diff)
}
