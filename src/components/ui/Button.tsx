import { cva, type VariantProps } from 'class-variance-authority'
import type { FC } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '~/lib/cn'

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 rounded-[--radius-sm] font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40',
	{
		variants: {
			variant: {
				default: 'bg-accent text-surface-0 hover:bg-accent-hover',
				secondary: 'bg-macro-protein text-surface-0 hover:bg-macro-protein/80',
				destructive: 'bg-destructive text-ink hover:bg-destructive/80',
				outline: 'border border-edge bg-transparent text-ink hover:bg-surface-2',
				ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink'
			},
			size: {
				default: 'h-8 px-3 py-1.5',
				sm: 'h-7 px-2.5 text-xs',
				lg: 'h-9 px-5',
				icon: 'size-8'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export const Button: FC<ButtonProps> = ({ className, variant, size, ...props }) => {
	return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export const LinkButton: FC<LinkProps & VariantProps<typeof buttonVariants>> = ({
	className,
	variant,
	size,
	...props
}) => {
	return <Link className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
