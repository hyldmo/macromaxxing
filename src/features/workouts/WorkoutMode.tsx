import type { SetMode } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import type { FC } from 'react'
import { ButtonGroup, type ButtonGroupOption } from '~/components/ui'

export const SET_MODE_OPTIONS: ButtonGroupOption<SetMode>[] = [
	{ value: 'working', label: 'W', expandedLabel: startCase('working') },
	{ value: 'warmup', label: 'WU', expandedLabel: startCase('warmup') },
	{ value: 'backoff', label: 'BO', expandedLabel: startCase('backoff') },
	{ value: 'full', label: 'F', expandedLabel: startCase('full') }
]

export interface WorkoutModesProps {
	value: SetMode
	onChange: (value: SetMode) => void
}

export const WorkoutModes: FC<WorkoutModesProps> = ({ value, onChange }) => (
	<ButtonGroup options={SET_MODE_OPTIONS} value={value} onChange={onChange} size="sm" />
)
