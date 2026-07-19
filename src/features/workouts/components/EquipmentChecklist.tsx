import { EQUIPMENT_CATEGORIES, EQUIPMENT_LABELS, type Equipment } from '@macromaxxing/db'
import type { FC } from 'react'
import { cn } from '~/lib'

export interface EquipmentChecklistProps {
	selected: readonly Equipment[]
	onChange: (equipment: Equipment[]) => void
	disabled?: boolean
}

/** Toggle-chip checklist over the fixed equipment vocabulary, grouped by category. Shared by the location editor and exercise form. */
export const EquipmentChecklist: FC<EquipmentChecklistProps> = ({ selected, onChange, disabled }) => {
	const active = new Set(selected)
	return (
		<div className="space-y-2">
			{EQUIPMENT_CATEGORIES.map(category => (
				<div key={category.label} className="flex flex-wrap gap-1.5">
					<span className="w-full text-[10px] text-ink-faint uppercase tracking-wide">{category.label}</span>
					{category.items.map(eq => (
						<button
							key={eq}
							type="button"
							disabled={disabled}
							onClick={() =>
								onChange(active.has(eq) ? selected.filter(e => e !== eq) : [...selected, eq])
							}
							className={cn(
								'rounded-sm border px-2 py-1 text-xs transition-colors',
								active.has(eq)
									? 'border-accent bg-accent/10 text-accent'
									: 'border-edge bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink',
								disabled && 'cursor-not-allowed opacity-50'
							)}
						>
							{EQUIPMENT_LABELS[eq]}
						</button>
					))}
				</div>
			))}
		</div>
	)
}
