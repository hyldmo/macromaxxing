import type { FC } from 'react'
import { targetStatus } from '~/features/nutrition/utils/targets'
import { cn } from '~/lib'

const STATUS_CLASS = {
	under: 'text-macro-kcal',
	on: 'text-success',
	over: 'text-destructive'
} as const

export interface KcalReadoutProps {
	kcal: number
	/** null when the user hasn't set a nutrition goal — renders the bare number. */
	target: number | null
	className?: string
}

/** `1850/2400` — the number takes the status color, the target stays faint. */
export const KcalReadout: FC<KcalReadoutProps> = ({ kcal, target, className }) => (
	<span className={cn('font-mono tabular-nums', className)}>
		<span
			className={cn(
				'font-semibold',
				target == null ? 'text-macro-kcal' : STATUS_CLASS[targetStatus(kcal, target)]
			)}
		>
			{kcal.toFixed(0)}
		</span>
		{target != null && <span className="font-normal text-ink-faint">/{target}</span>}
	</span>
)
