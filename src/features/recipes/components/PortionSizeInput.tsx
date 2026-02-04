import { useState } from 'react'
import { Input } from '~/components/ui/Input'

interface PortionSizeInputProps {
	portionSize: number
	onChange: (value: number) => void
}

export function PortionSizeInput({ portionSize, onChange }: PortionSizeInputProps) {
	const [value, setValue] = useState(portionSize.toString())

	function handleBlur() {
		const parsed = Number.parseFloat(value)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setValue(portionSize.toString())
			return
		}
		onChange(parsed)
	}

	return (
		<label className="flex items-center gap-2">
			<span className="text-ink-muted text-sm">Portion size</span>
			<Input
				type="number"
				className="h-7 w-20 text-right font-mono"
				value={value}
				onChange={e => setValue(e.target.value)}
				onBlur={handleBlur}
				min={0}
			/>
			<span className="text-ink-faint text-xs">g</span>
		</label>
	)
}
