import type { FC } from 'react'
import { cn } from '~/lib'

export interface BarcodeStripProps {
	seed?: string
	className?: string
}

export const BarcodeStrip: FC<BarcodeStripProps> = ({ seed = 'macromaxxing', className }) => {
	const bars = Array.from({ length: 42 }, (_, i) => {
		const n = (seed.charCodeAt(i % seed.length) + i * 31) % 5
		const width = n < 2 ? 1 : n < 4 ? 2 : 3
		const height = 55 + ((i * 13) % 45)
		return { id: `${seed}-${i}-${width}-${height}`, width, height }
	})
	return (
		<div className={cn('flex h-7 items-end gap-[2px]', className)}>
			{bars.map(bar => (
				<div key={bar.id} className="bg-ink/80" style={{ width: `${bar.width}px`, height: `${bar.height}%` }} />
			))}
		</div>
	)
}
