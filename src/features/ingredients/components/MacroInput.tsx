import type { FC } from 'react'
import { NumberInput } from '~/components/ui'
import { cn } from '~/lib/cn'

export type MacroLabel = keyof typeof colorMap

export interface MacroInputProps {
	label: MacroLabel
	value: string
	onChange: (value: string) => void
}

const colorMap = {
	Protein: 'text-macro-protein',
	Carbs: 'text-macro-carbs',
	Fat: 'text-macro-fat',
	Kcal: 'text-macro-kcal',
	Fiber: 'text-macro-fiber'
} satisfies Record<string, string>

export const MacroInput: FC<MacroInputProps> = ({ label, value, onChange }) => (
	<label>
		<span className={cn('mb-1 block text-xs', colorMap[label])}>{label}</span>
		<NumberInput value={value} onChange={e => onChange(e.target.value)} unit="g" />
	</label>
)
