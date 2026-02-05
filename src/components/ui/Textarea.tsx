import { forwardRef } from 'react'
import { cn } from '~/lib/cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
	return (
		<textarea
			className={cn(
				'flex min-h-[80px] w-full rounded-[--radius-sm] border border-edge bg-surface-1 px-3 py-2 text-ink text-sm shadow-none transition-colors placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
				className
			)}
			ref={ref}
			{...props}
		/>
	)
})
Textarea.displayName = 'Textarea'
