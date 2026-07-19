import { type Equipment, formatEquipmentList } from '@macromaxxing/db'
import { AlertTriangle } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '~/lib'

export interface EquipmentWarningProps {
	missing: readonly Equipment[]
	className?: string
}

/** Amber chip listing equipment an exercise needs that the selected location lacks. Renders nothing when available. */
export const EquipmentWarning: FC<EquipmentWarningProps> = ({ missing, className }) =>
	missing.length === 0 ? null : (
		<span
			className={cn(
				'inline-flex min-w-0 items-center gap-1 border border-amber-500/60 bg-amber-500/10 px-1.5 py-px font-mono text-[10px] text-amber-500',
				className
			)}
			title={`Missing equipment: ${formatEquipmentList(missing)}`}
		>
			<AlertTriangle className="size-3 shrink-0" />
			<span className="truncate">{formatEquipmentList(missing)}</span>
		</span>
	)
