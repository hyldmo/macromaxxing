import { ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, type KeyboardEvent, type MouseEvent, useCallback, useRef, useState } from 'react'
import { cn } from '~/lib'

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
	/** Minimum value (default: 0) */
	min?: number
	/** Step for arrow key increment/decrement (default: 1) */
	step?: number | 'auto'
	/** Unit label shown in the arrow button area when not hovered/focused */
	unit?: string
}

function triggerChange(input: HTMLInputElement, value: string) {
	const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
	nativeSetter?.call(input, value)
	input.dispatchEvent(new Event('input', { bubbles: true }))
}

function autoStep(value: number): number {
	const abs = Math.abs(value)
	if (abs < 2) return 0.25
	if (abs < 10) return 0.5
	if (abs < 50) return 1
	if (abs < 200) return 5
	if (abs < 1000) return 10
	return 50
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
	(
		{ className, min = 0, step = 'auto', unit, onKeyDown, onBlur, onFocus, onChange, value, placeholder, ...props },
		ref
	) => {
		const innerRef = useRef<HTMLInputElement | null>(null)
		// While focused, hold the raw string so parent's numeric round-trip
		// (e.g. "22." → 22 → "22") doesn't clobber in-progress typing
		const [localValue, setLocalValue] = useState<string | null>(null)

		const bump = useCallback(
			(direction: 1 | -1, input: HTMLInputElement) => {
				const placeholderNumber = placeholder ? Number.parseFloat(placeholder) : NaN
				const defaultNumber = Number.isNaN(placeholderNumber) ? 0 : placeholderNumber
				const current = Number.parseFloat(input.value) || defaultNumber
				const s = step === 'auto' ? autoStep(current) : step
				const stepDecimals = String(s).split('.')[1]?.length ?? 0
				const snapped = direction === 1 ? Math.floor(current / s) * s + s : Math.ceil(current / s) * s - s
				const next = Math.max(min, snapped)
				const formatted = stepDecimals > 0 ? next.toFixed(stepDecimals) : String(Math.round(next))
				triggerChange(input, formatted)
				setLocalValue(formatted)
			},
			[step, min, placeholder]
		)

		const handleKeyDown = useCallback(
			(e: KeyboardEvent<HTMLInputElement>) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault()
					bump(e.key === 'ArrowUp' ? 1 : -1, e.currentTarget)
				}
				onKeyDown?.(e)
			},
			[bump, onKeyDown]
		)

		const handleFocus = useCallback(
			(e: React.FocusEvent<HTMLInputElement>) => {
				setLocalValue(String(value ?? ''))
				e.target.select()
				onFocus?.(e)
			},
			[value, onFocus]
		)

		const handleChange = useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				setLocalValue(e.target.value)
				onChange?.(e)
			},
			[onChange]
		)

		const handleBlur = useCallback(
			(e: React.FocusEvent<HTMLInputElement>) => {
				setLocalValue(null)
				const v = e.currentTarget.value
				if (v !== '') {
					const n = Number.parseFloat(v)
					if (!Number.isNaN(n)) {
						// "1.00" → "1", "2.50" → "2.5", "0.25" → "0.25"
						const clean = String(n)
						if (clean !== v) triggerChange(e.currentTarget, clean)
					}
				}
				onBlur?.(e)
			},
			[onBlur]
		)

		const handleArrowClick = useCallback(
			(e: MouseEvent, direction: 1 | -1) => {
				e.preventDefault()
				const input = innerRef.current
				if (input && !input.disabled && !input.readOnly) {
					bump(direction, input)
					input.focus()
				}
			},
			[bump]
		)

		const enabled = !(props.readOnly || props.disabled)

		return (
			<div
				className={cn(
					'group flex h-8 items-stretch rounded-sm border border-edge bg-surface-1 transition-colors focus-within:ring-1 focus-within:ring-accent/50',
					{ 'opacity-40': !enabled, 'cursor-not-allowed': props.disabled },
					className
				)}
			>
				<input
					ref={el => {
						innerRef.current = el
						if (typeof ref === 'function') ref(el)
						else if (ref) ref.current = el
					}}
					type="text"
					inputMode="decimal"
					className="min-w-0 flex-1 bg-transparent py-1 pr-1 pl-2 text-right font-mono text-ink text-sm tabular-nums shadow-none outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
					value={localValue !== null ? localValue : (value ?? '')}
					onFocus={handleFocus}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					placeholder={placeholder}
					{...props}
				/>
				<div
					className={cn('relative flex w-5 shrink-0 flex-col border-transparent border-l', {
						'group-focus-within:border-edge group-hover:border-edge': enabled
					})}
				>
					{unit && (placeholder === unit ? !!value : true) && (
						<span
							className={cn(
								'pointer-events-none absolute inset-0 flex items-center pt-0.5 font-mono text-[10px] text-ink-faint transition-opacity',
								{ 'group-focus-within:opacity-0 group-hover:opacity-0': enabled }
							)}
						>
							{unit}
						</span>
					)}
					{enabled && (
						<>
							<button
								type="button"
								tabIndex={-1}
								className="flex flex-1 cursor-pointer items-center justify-center text-ink-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-focus-within:opacity-100 group-hover:opacity-100"
								onMouseDown={e => handleArrowClick(e, 1)}
							>
								<ChevronUp className="size-3" />
							</button>
							<button
								type="button"
								tabIndex={-1}
								className="flex flex-1 cursor-pointer items-center justify-center border-edge border-t text-ink-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-focus-within:opacity-100 group-hover:opacity-100"
								onMouseDown={e => handleArrowClick(e, -1)}
							>
								<ChevronDown className="size-3" />
							</button>
						</>
					)}
				</div>
			</div>
		)
	}
)
NumberInput.displayName = 'NumberInput'
