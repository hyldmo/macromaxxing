import { type FC, useState } from 'react'
import { NumberInput } from '~/components/ui'

export interface DiscardedFatInputProps {
	discardedFat: number | null
	onChange?: (value: number | null) => void
}

/**
 * Rendered fat that stayed in the pan, in grams. The placeholder calibrates the eyeball against a
 * cutlery spoonful (~9 ml of liquid), not the 15 ml measuring tbsp — nobody drains a pan with a
 * measuring spoon, and the app's `tbsp` unit keeps meaning 15 ml everywhere else.
 */
export const DiscardedFatInput: FC<DiscardedFatInputProps> = ({ discardedFat, onChange }) => {
	const readOnly = !onChange
	const [value, setValue] = useState(discardedFat?.toString() ?? '')

	function handleBlur() {
		if (!onChange) return
		if (value === '') {
			onChange(null)
			return
		}
		const parsed = Number.parseFloat(value)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setValue(discardedFat?.toString() ?? '')
			return
		}
		onChange(parsed)
	}

	return (
		<label className="flex flex-col gap-1">
			<span className="text-ink-muted text-xs uppercase tracking-wider">Discarded fat</span>
			<div className="flex items-center gap-2">
				<NumberInput
					className="h-8 w-full"
					placeholder="1 spoonful ≈ 8 g"
					value={value}
					onChange={e => setValue(e.target.value)}
					onBlur={handleBlur}
					min={0}
					readOnly={readOnly}
					disabled={readOnly}
				/>
				<span className="text-ink-faint text-xs">g</span>
			</div>
			{discardedFat !== null && discardedFat > 0 && (
				<span className="font-mono text-[10px] text-ink-faint">
					−{discardedFat.toFixed(0)}g fat · −{(discardedFat * 9).toFixed(0)} kcal
				</span>
			)}
		</label>
	)
}
