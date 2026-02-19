import { forwardRef } from 'react'
import { cn } from '~/lib'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
	return (
		<input
			className={cn(
				'flex h-8 w-full rounded-sm border border-edge bg-surface-1 px-2.5 py-1 text-ink text-sm shadow-none transition-colors placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
				className
			)}
			ref={ref}
			{...props}
		/>
	)
})
Input.displayName = 'Input'
