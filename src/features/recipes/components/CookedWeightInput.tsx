import { Sparkles } from 'lucide-react'
import { type FC, useId, useState } from 'react'
import { Button, NumberInput, Spinner } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export interface CookedWeightInputProps {
	cookedWeight: number | null
	rawTotal: number
	onChange?: (value: number | null) => void
	ingredients?: Array<{ name: string; grams: number }>
	instructions?: string
}

/**
 * Renders bare cells for PortionPanel's shared grid (label row, then input · unit · action, then a
 * hint row) — it has no box of its own, so it only works inside that grid.
 */
export const CookedWeightInput: FC<CookedWeightInputProps> = ({
	cookedWeight,
	rawTotal,
	onChange,
	ingredients,
	instructions
}) => {
	const readOnly = !onChange
	const inputId = useId()
	const [value, setValue] = useState(cookedWeight?.toString() ?? '')
	const estimateMutation = trpc.ai.estimateCookedWeight.useMutation({
		onSuccess: data => {
			const rounded = Math.round(data.cookedWeight)
			setValue(rounded.toString())
			onChange?.(rounded)
		}
	})

	const effectiveWeight = cookedWeight ?? rawTotal
	const lossPct = rawTotal > 0 ? ((effectiveWeight - rawTotal) / rawTotal) * 100 : 0

	function handleBlur() {
		if (!onChange) return
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

	const canEstimate = !readOnly && ingredients && ingredients.length > 0

	return (
		<>
			<label
				htmlFor={inputId}
				className="col-span-3 col-start-1 mt-2 text-ink-muted text-xs uppercase tracking-wider first:mt-0"
			>
				Cooked weight
			</label>
			<NumberInput
				id={inputId}
				placeholder={rawTotal.toFixed(0)}
				value={value}
				onChange={e => setValue(e.target.value)}
				onBlur={handleBlur}
				min={0}
				readOnly={readOnly}
				disabled={readOnly}
			/>
			<span className="text-ink-faint text-xs">g</span>
			{canEstimate && (
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={() => estimateMutation.mutate({ ingredients, instructions })}
					disabled={estimateMutation.isPending}
					title="Estimate with AI"
				>
					{estimateMutation.isPending ? (
						<Spinner className="size-4 text-current" />
					) : (
						<Sparkles className="size-4 text-current" />
					)}
				</Button>
			)}
			{rawTotal > 0 && (
				<span className="col-span-3 col-start-1 font-mono text-[10px] text-ink-faint">
					{rawTotal.toFixed(0)}g raw{' '}
					{cookedWeight && cookedWeight !== rawTotal && (
						<>
							→ {cookedWeight.toFixed(0)}g ({lossPct > 0 ? '+' : ''}
							{lossPct.toFixed(0)}%)
						</>
					)}
				</span>
			)}
		</>
	)
}
