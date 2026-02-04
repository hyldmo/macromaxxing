import { useState } from 'react'
import { Input } from '~/components/ui/Input'

interface CookedWeightInputProps {
	cookedWeight: number | null
	rawTotal: number
	onChange: (value: number | null) => void
}

export function CookedWeightInput({ cookedWeight, rawTotal, onChange }: CookedWeightInputProps) {
	const [value, setValue] = useState(cookedWeight?.toString() ?? '')

	function handleBlur() {
		if (value === '' || value === rawTotal.toString()) {
			onChange(null)
			return
		}
		const parsed = Number.parseFloat(value)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setValue(cookedWeight?.toString() ?? '')
			return
		}
		onChange(parsed)
	}

	return (
		<label className="flex items-center gap-2">
			<span className="text-ink-muted text-sm">Cooked weight</span>
			<Input
				type="number"
				className="h-7 w-20 text-right font-mono"
				placeholder={rawTotal.toFixed(0)}
				value={value}
				onChange={e => setValue(e.target.value)}
				onBlur={handleBlur}
				min={0}
			/>
			<span className="text-ink-faint text-xs">g</span>
		</label>
	)
}
