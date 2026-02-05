import { Loader2 } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '~/lib/cn'

export interface SpinnerProps {
	className?: string
}

export const Spinner: FC<SpinnerProps> = ({ className }) => {
	return <Loader2 className={cn('h-5 w-5 animate-spin text-accent', className)} />
}
