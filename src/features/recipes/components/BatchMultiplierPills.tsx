import { type FC, useRef, useState } from 'react'
import { NumberInput } from '~/components/ui'
import { cn } from '~/lib'

export interface BatchMultiplierPillsProps {
	value: number
	onChange: (value: number) => void
}

const PRESETS = [1, 2, 3, 4]

export const BatchMultiplierPills: FC<BatchMultiplierPillsProps> = ({ value, onChange }) => {
	const [showCustom, setShowCustom] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const isPreset = PRESETS.includes(value)

	return (
		<div className="flex items-center gap-2">
			{PRESETS.map(n => (
				<button
					key={n}
					type="button"
					onClick={() => {
						onChange(n)
						setShowCustom(false)
					}}
					className={cn(
						'flex size-10 items-center justify-center rounded-full font-mono font-semibold text-sm transition-colors',
						value === n
							? 'bg-accent text-surface-0'
							: 'border border-edge bg-surface-1 text-ink-muted hover:bg-surface-2'
					)}
				>
					{n}&times;
				</button>
			))}
			{showCustom ? (
				<NumberInput
					ref={inputRef}
					className="w-16"
					min={1}
					step={1}
					value={value}
					autoFocus
					onChange={e => {
						const n = Number.parseFloat(e.target.value)
						if (!Number.isNaN(n) && n >= 1) onChange(n)
					}}
					onBlur={() => {
						if (isPreset) setShowCustom(false)
					}}
				/>
			) : !isPreset ? (
				<button
					type="button"
					onClick={() => setShowCustom(true)}
					className="flex size-10 items-center justify-center rounded-full bg-accent font-mono font-semibold text-sm text-surface-0"
				>
					{value}&times;
				</button>
			) : (
				<button
					type="button"
					onClick={() => setShowCustom(true)}
					className="flex size-10 items-center justify-center rounded-full border border-edge bg-surface-1 font-mono text-ink-muted text-sm transition-colors hover:bg-surface-2"
				>
					&hellip;
				</button>
			)}
		</div>
	)
}
