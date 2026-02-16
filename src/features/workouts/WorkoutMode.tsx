import type { SetMode } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import type { FC } from 'react'
import { cn } from '~/lib/cn'

export const SET_MODE_OPTIONS: { value: SetMode; label: string }[] = [
	{ value: 'working', label: 'W' },
	{ value: 'warmup', label: 'WU' },
	{ value: 'backoff', label: 'BO' },
	{ value: 'full', label: 'Full' }
]

export interface WorkoutModesProps {
	value: SetMode
	onChange: (value: SetMode) => void
}

export const WorkoutModes: FC<WorkoutModesProps> = ({ value, onChange }) => {
	return (
		<div className="flex">
			{SET_MODE_OPTIONS.map(opt => (
				<button
					key={opt.value}
					type="button"
					className={cn(
						'group border border-edge px-1.5 py-0.5 text-[10px] first:rounded-l-sm last:rounded-r-sm',
						{
							'bg-accent text-white': value === opt.value,
							'bg-surface-0 text-ink-faint hover:text-ink': value !== opt.value
						}
					)}
					onClick={e => {
						e.stopPropagation()
						onChange(opt.value)
					}}
				>
					<span className={cn('group-hover:hidden', value === opt.value && 'hidden')}>{opt.label}</span>
					<span className={cn(value === opt.value ? 'block' : 'hidden group-hover:block')}>
						{startCase(opt.value)}
					</span>
				</button>
			))}
		</div>
	)
}
