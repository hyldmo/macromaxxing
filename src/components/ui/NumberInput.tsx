import { ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, type KeyboardEvent, type MouseEvent, useCallback, useRef } from 'react'
import { cn } from '~/lib/cn'

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
	/** Minimum value (default: 0) */
	min?: number
	/** Step for arrow key increment/decrement (default: 1) */
	step?: number | 'auto'
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
	({ className, min = 0, step = 'auto', onKeyDown, onBlur, ...props }, ref) => {
		const innerRef = useRef<HTMLInputElement | null>(null)

		const bump = useCallback(
			(direction: 1 | -1, input: HTMLInputElement) => {
				const current = Number.parseFloat(input.value) || 0
				const s = step === 'auto' ? autoStep(current) : step
				const decimals = s < 1 ? (String(s).split('.')[1]?.length ?? 1) : 0
				const snapped = direction === 1 ? Math.floor(current / s) * s + s : Math.ceil(current / s) * s - s
				const next = Math.max(min, snapped)
				const formatted = decimals > 0 ? next.toFixed(decimals) : String(Math.round(next))
				triggerChange(input, formatted)
			},
			[step, min]
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

		const handleBlur = useCallback(
			(e: React.FocusEvent<HTMLInputElement>) => {
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

		return (
			<div
				className={cn(
					'group flex h-8 items-stretch rounded-[--radius-sm] border border-edge bg-surface-1 transition-colors focus-within:ring-1 focus-within:ring-accent/50',
					props.disabled && 'cursor-not-allowed opacity-40',
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
					className="min-w-0 flex-1 bg-transparent px-2 py-1 text-right font-mono text-ink text-sm tabular-nums shadow-none outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					{...props}
				/>
				<div className="flex w-5 shrink-0 flex-col border-edge border-l opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
					<button
						type="button"
						tabIndex={-1}
						className="flex flex-1 cursor-default items-center justify-center text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
						onMouseDown={e => handleArrowClick(e, 1)}
					>
						<ChevronUp className="size-3" />
					</button>
					<button
						type="button"
						tabIndex={-1}
						className="flex flex-1 cursor-default items-center justify-center border-edge border-t text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
						onMouseDown={e => handleArrowClick(e, -1)}
					>
						<ChevronDown className="size-3" />
					</button>
				</div>
			</div>
		)
	}
)
NumberInput.displayName = 'NumberInput'
