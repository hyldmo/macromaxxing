import { type FC, useEffect, useState } from 'react'
import { NumberInput } from '~/components/ui'

export interface PortionSizeInputProps {
	portionSize: number | null
	effectiveCookedWeight: number
	onChange?: (value: number | null) => void
}

export const PortionSizeInput: FC<PortionSizeInputProps> = ({ portionSize, effectiveCookedWeight, onChange }) => {
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
		<div className="flex flex-col gap-1">
			<span className="text-ink-muted text-xs uppercase tracking-wider">Portion size</span>
			<div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
				<NumberInput
					className="h-8"
					value={gramsValue}
					onChange={e => setGramsValue(e.target.value)}
					onBlur={handleGramsBlur}
					placeholder="Whole"
					min={0}
					readOnly={readOnly}
					disabled={readOnly}
				/>
				<span className="text-ink-faint text-xs">g</span>
				<span className="col-span-2 text-center text-ink-faint text-xs">=</span>
				<NumberInput
					className="h-8"
					value={countValue}
					onChange={e => setCountValue(e.target.value)}
					onBlur={handleCountBlur}
					placeholder="1"
					min={0}
					readOnly={readOnly}
					disabled={readOnly}
				/>
				<span className="text-ink-faint text-xs">portions</span>
			</div>
		</div>
	)
}
