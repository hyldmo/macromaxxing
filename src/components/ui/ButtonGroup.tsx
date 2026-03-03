import { cn } from '~/lib'

export interface ButtonGroupOption<T extends string> {
	value: T
	label: string
	expandedLabel?: string
}

export interface ButtonGroupProps<T extends string> {
	options: ButtonGroupOption<T>[]
	value: T
	onChange?: (value: T) => void
	size?: 'sm' | 'md'
}

const SIZE_STYLES = {
	sm: 'px-1.5 py-0.5 text-[10px]',
	md: 'px-3 py-1 text-sm'
} as const

export function ButtonGroup<T extends string>({ options, value, onChange, size = 'md' }: ButtonGroupProps<T>) {
	const readOnly = !onChange

	return (
		<div className="flex">
			{options.map(opt => {
				const isActive = opt.value === value
				const base = cn(
					SIZE_STYLES[size],
					'font-mono first:rounded-l-sm last:rounded-r-sm',
					readOnly
						? cn(isActive ? 'bg-accent/15 text-accent' : 'text-ink-faint')
						: cn(
								'border border-edge',
								isActive ? 'bg-accent text-white' : 'bg-surface-0 text-ink-faint hover:text-ink'
							)
				)

				if (readOnly) {
					return (
						<span key={opt.value} className={base}>
							{opt.label}
						</span>
					)
				}

				return (
					<button
						key={opt.value}
						type="button"
						className={cn(base, opt.expandedLabel && 'group')}
						onClick={e => {
							e.stopPropagation()
							onChange(opt.value)
						}}
					>
						{opt.expandedLabel ? (
							<>
								<span className={cn('group-hover:hidden', isActive && 'hidden')}>{opt.label}</span>
								<span className={cn(isActive ? 'block' : 'hidden group-hover:block')}>
									{opt.expandedLabel}
								</span>
							</>
						) : (
							opt.label
						)}
					</button>
				)
			})}
		</div>
	)
}
