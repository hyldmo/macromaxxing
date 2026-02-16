import { startCase } from 'es-toolkit'
import type { Except } from 'type-fest'
import { cn } from '~/lib/cn'

export interface SelectProps<T extends string | number>
	extends Except<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
	value?: T
	options: Array<{ label: string; value: T } | T>
	onChange?: (value: T) => void
}

export function Select<T extends string | number>({ className, options, onChange, ...props }: SelectProps<T>) {
	return (
		<select
			className={cn(
				'flex h-8 w-full rounded-sm border border-edge bg-surface-1 px-2 py-1 text-ink text-sm shadow-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
				className
			)}
			onChange={e => onChange?.(e.target.value as T)}
			{...props}
		>
			{options.map(option =>
				typeof option !== 'object' ? (
					<option key={option} value={option}>
						{startCase(option.toString())}
					</option>
				) : (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				)
			)}
		</select>
	)
}
