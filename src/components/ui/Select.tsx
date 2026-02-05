import { forwardRef } from 'react'
import { cn } from '~/lib/cn'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
	<select
		className={cn(
			'flex h-8 w-full rounded-[--radius-sm] border border-edge bg-surface-1 px-2 py-1 text-ink text-sm shadow-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
			className
		)}
		ref={ref}
		{...props}
	>
		{children}
	</select>
))
Select.displayName = 'Select'
