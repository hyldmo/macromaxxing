import type { FC } from 'react'
import { cn } from '~/lib'

export interface SwitchProps {
	id?: string
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
	className?: string
}

export const Switch: FC<SwitchProps> = ({ id, checked, onChange, disabled, className }) => (
	<button
		id={id}
		type="button"
		role="switch"
		aria-checked={checked}
		disabled={disabled}
		onClick={() => onChange(!checked)}
		className={cn(
			'relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-edge transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
			checked ? 'bg-accent' : 'bg-surface-2',
			className
		)}
	>
		<span
			className={cn(
				'pointer-events-none absolute top-0.5 left-0.5 size-3.5 rounded-full bg-ink shadow-sm transition-transform',
				checked && 'translate-x-4'
			)}
		/>
	</button>
)
