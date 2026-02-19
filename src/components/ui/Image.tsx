import type { FC } from 'react'
import { cn } from '~/lib'

export interface ImageProps {
	src: string
	alt: string
	className?: string
}

export const Image: FC<ImageProps> = ({ src, alt, className }) => (
	<div className={cn('relative shrink-0', className)}>
		{/* Corner registration marks */}
		<span className="absolute -top-1 -left-1 size-1.5 border-accent/40 border-t border-l" />
		<span className="absolute -top-1 -right-1 size-1.5 border-accent/40 border-t border-r" />
		<span className="absolute -bottom-1 -left-1 size-1.5 border-accent/40 border-b border-l" />
		<span className="absolute -right-1 -bottom-1 size-1.5 border-accent/40 border-r border-b" />

		<img src={src} alt={alt} className="size-full border border-edge object-cover" loading="lazy" />
	</div>
)
