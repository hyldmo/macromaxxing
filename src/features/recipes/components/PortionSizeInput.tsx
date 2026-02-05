import { type FC, useEffect, useState } from 'react'
import { Input } from '~/components/ui/Input'

export interface PortionSizeInputProps {
	portionSize: number | null
	onChange?: (value: number | null) => void
}

export const PortionSizeInput: FC<PortionSizeInputProps> = ({ portionSize, onChange }) => {
	const [value, setValue] = useState(portionSize?.toString() ?? '')
	const readOnly = !onChange

	useEffect(() => {
		setValue(portionSize?.toString() ?? '')
	}, [portionSize])

	function handleBlur() {
		if (!onChange) return
		const trimmed = value.trim()
		if (trimmed === '') {
			onChange(null)
			return
		}
		const parsed = Number.parseFloat(trimmed)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setValue(portionSize?.toString() ?? '')
			return
		}
		onChange(parsed)
	}

	return (
		<label className="flex flex-col gap-1">
			<span className="text-ink-muted text-xs uppercase tracking-wider">Portion size</span>
			<div className="flex items-center gap-2">
				<Input
					type="number"
					className="h-8 w-full text-right font-mono"
					value={value}
					onChange={e => setValue(e.target.value)}
					onBlur={handleBlur}
					placeholder="Whole"
					min={0}
					readOnly={readOnly}
					disabled={readOnly}
				/>
				<span className="text-ink-faint text-xs">g</span>
			</div>
		</label>
	)
}
