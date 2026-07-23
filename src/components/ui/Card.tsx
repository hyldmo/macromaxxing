import { type FC, forwardRef } from 'react'
import { cn } from '~/lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('rounded-md border border-edge bg-surface-1', className)} {...props} />
))

export const CardHeader: FC<CardProps> = ({ className, ...props }) => {
	return <div className={cn('border-edge border-b px-4 py-3', className)} {...props} />
}

export const CardContent: FC<CardProps> = ({ className, ...props }) => {
	return <div className={cn('px-4 py-3', className)} {...props} />
}
