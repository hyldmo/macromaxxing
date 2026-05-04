/** biome-ignore-all lint/a11y/noLabelWithoutControl: used for input components */
import type { FC } from 'react'
import { cn } from '~/lib'

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
	label: string
}

export const Label: FC<LabelProps> = ({ label, className, children, ...props }) => (
	<label className={cn('block', className)} {...props}>
		<span className="mb-1 block text-ink-muted text-xs">{label}</span>
		{children}
	</label>
)
