import { type FC, useEffect, useId, useState } from 'react'
import { NumberInput } from '~/components/ui'

export interface PortionSizeInputProps {
	portionSize: number | null
	effectiveCookedWeight: number
	onChange?: (value: number | null) => void
}

/**
 * Renders bare cells for PortionPanel's shared grid — a label row, the size in grams, then the same
 * size read back as a portion count. It has no box of its own, so it only works inside that grid.
 */
export const PortionSizeInput: FC<PortionSizeInputProps> = ({ portionSize, effectiveCookedWeight, onChange }) => {
	const gramsId = useId()
	const [gramsValue, setGramsValue] = useState(portionSize?.toString() ?? '')
	const [countValue, setCountValue] = useState(() =>
		portionSize !== null && portionSize > 0 ? (effectiveCookedWeight / portionSize).toFixed(1) : ''
	)
	const readOnly = !onChange

	useEffect(() => {
		setGramsValue(portionSize?.toString() ?? '')
		setCountValue(portionSize !== null && portionSize > 0 ? (effectiveCookedWeight / portionSize).toFixed(1) : '')
	}, [portionSize, effectiveCookedWeight])

	function handleGramsBlur() {
		if (!onChange) return
		const trimmed = gramsValue.trim()
		if (trimmed === '') {
			onChange(null)
			return
		}
		const parsed = Number.parseFloat(trimmed)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setGramsValue(portionSize?.toString() ?? '')
			return
		}
		onChange(parsed)
	}

	function handleCountBlur() {
		if (!onChange) return
		const trimmed = countValue.trim()
		if (trimmed === '') {
			onChange(null)
			return
		}
		const parsed = Number.parseFloat(trimmed)
		if (Number.isNaN(parsed) || parsed <= 0) {
			setCountValue(
				portionSize !== null && portionSize > 0 ? (effectiveCookedWeight / portionSize).toFixed(1) : ''
			)
			return
		}
		onChange(Math.round(effectiveCookedWeight / parsed))
	}

	return (
		<>
			<label
				htmlFor={gramsId}
				className="col-span-3 col-start-1 mt-2 text-ink-muted text-xs uppercase tracking-wider first:mt-0"
			>
				Portion size
			</label>
			<NumberInput
				id={gramsId}
				value={gramsValue}
				onChange={e => setGramsValue(e.target.value)}
				onBlur={handleGramsBlur}
				placeholder="Whole"
				min={0}
				readOnly={readOnly}
				disabled={readOnly}
			/>
			<span className="text-ink-faint text-xs">g</span>
			<span className="col-span-3 col-start-1 text-center text-ink-faint text-xs">=</span>
			<NumberInput
				aria-label="Portions"
				value={countValue}
				onChange={e => setCountValue(e.target.value)}
				onBlur={handleCountBlur}
				placeholder="1"
				min={0}
				readOnly={readOnly}
				disabled={readOnly}
			/>
			<span className="text-ink-faint text-xs">portions</span>
		</>
	)
}
