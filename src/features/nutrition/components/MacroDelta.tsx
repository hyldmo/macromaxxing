import type { FC } from 'react'
import { targetDelta } from '~/features/nutrition/utils/targets'
import { cn } from '~/lib'

export interface MacroDeltaProps {
	/** Short macro tag: P / C / F / Fi. */
	label: string
	value: number
	/** null/undefined when no goal is set — the delta is simply omitted. */
	target?: number | null
	/** Rendered after the value, e.g. `g`. */
	unit?: string
	className?: string
}

/** `P180` on its own, `P180 -12` when a target says how far off it is. */
export const MacroDelta: FC<MacroDeltaProps> = ({ label, value, target, unit = '', className }) => {
	const delta = target != null ? targetDelta(value, target) : ''
	return (
		<span className={cn('font-mono tabular-nums', className)}>
			{label}
			{value.toFixed(0)}
			{unit}
			{delta && <span className="ml-0.5 text-ink-faint">{delta}</span>}
		</span>
	)
}
