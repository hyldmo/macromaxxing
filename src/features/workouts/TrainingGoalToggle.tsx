import type { TrainingGoal } from '@macromaxxing/db'
import type { FC } from 'react'
import { cn } from '~/lib/cn'

export const TRAINING_GOAL_OPTIONS: { value: TrainingGoal | null; label: string; full: string }[] = [
	{ value: null, label: '—', full: 'Default' },
	{ value: 'hypertrophy', label: 'H', full: 'Hypertrophy' },
	{ value: 'strength', label: 'S', full: 'Strength' }
]

export interface TrainingGoalToggleProps {
	workoutGoal: TrainingGoal
	value: TrainingGoal | null
	onChange: (value: TrainingGoal | null) => void
}

export const TrainingGoalToggle: FC<TrainingGoalToggleProps> = ({ workoutGoal, value, onChange }) => (
	<div className="flex">
		{TRAINING_GOAL_OPTIONS.map(opt => (
			<button
				key={opt.label}
				type="button"
				className={cn(
					'group border border-edge px-1.5 py-0.5 text-[10px] first:rounded-l-sm last:rounded-r-sm',
					{
						'bg-accent text-white': value === opt.value && opt.value !== null,
						'bg-surface-0 text-ink-faint hover:text-ink': value !== opt.value,
						'bg-surface-0 opacity-50': opt.value === null
					}
				)}
				onClick={e => {
					e.stopPropagation()
					onChange(opt.value)
				}}
			>
				{opt.value === null && value === null ? (
					workoutGoal[0].toUpperCase()
				) : (
					<>
						<span className="group-hover:hidden">{opt.label}</span>
						<span className="hidden group-hover:block">{opt.full}</span>
					</>
				)}
			</button>
		))}
	</div>
)
