import type { FC } from 'react'
import { type TargetKind, targetDelta } from '~/features/nutrition/utils/targets'
import { cn } from '~/lib'

export interface MacroDeltaProps {
	/** Short macro tag: P / C / F / Fi. */
	label: string
	value: number
	/** null/undefined when no goal is set — the delta is simply omitted. */
	target?: number | null
	/**
	 * Defaults to `floor`, which is what every macro is — clearing one is the whole ask, so no
	 * surplus is rendered. Calories are the one budget, and they have `KcalReadout`.
	 */
	kind?: TargetKind
	/** Rendered after the value, e.g. `g`. */
	unit?: string
	className?: string
}

/** `P180` on its own, `P180 -12` when a floor says how far short it is. */
export const MacroDelta: FC<MacroDeltaProps> = ({ label, value, target, kind = 'floor', unit = '', className }) => {
	const delta = target != null ? targetDelta(value, target, kind) : ''
	return (
		<span className={cn('font-mono tabular-nums', className)}>
			{label}
			{value.toFixed(0)}
			{unit}
			{delta && <span className="ml-0.5 text-ink-faint">{delta}</span>}
		</span>
	)
}
