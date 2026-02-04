import { cn } from '~/lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
	return <div className={cn('rounded-[--radius-md] border border-edge bg-surface-1', className)} {...props} />
}

export function CardHeader({ className, ...props }: CardProps) {
	return <div className={cn('border-edge border-b px-4 py-3', className)} {...props} />
}

export function CardContent({ className, ...props }: CardProps) {
	return <div className={cn('px-4 py-3', className)} {...props} />
}
