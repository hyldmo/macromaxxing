import { useState } from 'react'
import { Input } from '~/components/ui/Input'

interface CookedWeightInputProps {
	cookedWeight: number | null
	rawTotal: number
	onChange: (value: number | null) => void
}

export function CookedWeightInput({ cookedWeight, rawTotal, onChange }: CookedWeightInputProps) {
	const [value, setValue] = useState(cookedWeight?.toString() ?? '')

	const effectiveWeight = cookedWeight ?? rawTotal
	const lossPct = rawTotal > 0 ? ((effectiveWeight - rawTotal) / rawTotal) * 100 : 0

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
		<label className="flex flex-col gap-1">
			<span className="text-ink-muted text-xs uppercase tracking-wider">Cooked weight</span>
			<div className="flex items-center gap-2">
				<Input
					type="number"
					className="h-8 w-full text-right font-mono"
					placeholder={rawTotal.toFixed(0)}
					value={value}
					onChange={e => setValue(e.target.value)}
					onBlur={handleBlur}
					min={0}
				/>
				<span className="text-ink-faint text-xs">g</span>
			</div>
			{rawTotal > 0 && (
				<span className="font-mono text-[10px] text-ink-faint">
					{rawTotal.toFixed(0)}g raw{' '}
					{cookedWeight && cookedWeight !== rawTotal && (
						<>
							→ {cookedWeight.toFixed(0)}g ({lossPct > 0 ? '+' : ''}
							{lossPct.toFixed(0)}%)
						</>
					)}
				</span>
			)}
		</label>
	)
}
