import { type FC, useId, useState } from 'react'
import { NumberInput } from '~/components/ui'

export interface DiscardedFatInputProps {
	discardedFat: number | null
	onChange?: (value: number | null) => void
}

/**
 * Rendered fat that stayed in the pan, in grams. Renders bare cells for PortionPanel's shared grid
 * (label row, then input · unit, then a hint row) — it has no box of its own, so it only works
 * inside that grid.
 *
 * The placeholder calibrates the eyeball against a cutlery spoonful (~9 ml of liquid), not the 15 ml
 * measuring tbsp — nobody drains a pan with a measuring spoon, and the app's `tbsp` unit keeps
 * meaning 15 ml everywhere else.
 */
export const DiscardedFatInput: FC<DiscardedFatInputProps> = ({ discardedFat, onChange }) => {
	const readOnly = !onChange
	const inputId = useId()
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
		<>
			<label
				htmlFor={inputId}
				className="col-span-3 col-start-1 mt-2 text-ink-muted text-xs uppercase tracking-wider first:mt-0"
			>
				Discarded fat
			</label>
			<NumberInput
				id={inputId}
				placeholder="1 spoonful ≈ 8 g"
				value={value}
				onChange={e => setValue(e.target.value)}
				onBlur={handleBlur}
				min={0}
				readOnly={readOnly}
				disabled={readOnly}
			/>
			<span className="text-ink-faint text-xs">g</span>
			{discardedFat !== null && discardedFat > 0 && (
				<span className="col-span-3 col-start-1 font-mono text-[10px] text-ink-faint">
					−{discardedFat.toFixed(0)}g fat · −{(discardedFat * 9).toFixed(0)} kcal
				</span>
			)}
		</>
	)
}
