import type { SetType } from '@macromaxxing/db'
import { Check, Circle } from 'lucide-react'
import type { FC } from 'react'
import { NumberInput } from '~/components/ui/NumberInput'
import { cn } from '~/lib/cn'
import { estimated1RM } from '../utils/formulas'

const SET_TYPE_STYLES = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
} satisfies Record<SetType, string>

const CONFIRM_BORDER_STYLES = {
	warmup: 'border-macro-carbs bg-macro-carbs/20 text-macro-carbs',
	working: 'border-macro-protein bg-macro-protein/20 text-macro-protein',
	backoff: 'border-macro-fat bg-macro-fat/20 text-macro-fat'
} satisfies Record<SetType, string>

export interface SetRowProps {
	weightKg: number | null
	reps: number
	setType?: SetType
	done?: boolean
	active?: boolean
	rpe?: number | null
	failureFlag?: number | null
	onWeightChange?: (weight: number | null) => void
	onRepsChange?: (reps: number) => void
	onConfirm?: () => void
}

export const SetRow: FC<SetRowProps> = ({
	weightKg,
	reps,
	setType = 'working',
	done,
	active,
	rpe,
	failureFlag,
	onWeightChange,
	onRepsChange,
	onConfirm
}) => {
	const e1rm = done && reps > 0 ? estimated1RM(weightKg ?? 0, reps) : 0

	return (
		<div className={cn('flex items-center gap-1.5 rounded-sm py-0.5 sm:gap-2', active && 'bg-surface-2')}>
			<span
				className={cn(
					'w-7 shrink-0 rounded-full px-1 py-0.5 text-center font-mono text-[10px] sm:w-16 sm:px-1.5',
					SET_TYPE_STYLES[setType]
				)}
			>
				<span className="hidden sm:inline">{setType}</span>
				<span className="sm:hidden">{setType[0].toUpperCase()}</span>
			</span>
			<NumberInput
				className="w-16 sm:w-20"
				value={weightKg ?? ''}
				placeholder="kg"
				unit="kg"
				onChange={e => {
					const v = Number.parseFloat(e.target.value)
					onWeightChange?.(Number.isNaN(v) ? null : v)
				}}
				step={2.5}
				min={0}
				disabled={done}
			/>
			<span className="text-ink-faint text-xs">×</span>
			<NumberInput
				className="w-12 sm:w-16"
				value={reps}
				onChange={e => {
					const v = Number.parseInt(e.target.value, 10)
					if (!Number.isNaN(v) && v >= 0) onRepsChange?.(v)
				}}
				unit="r"
				step={1}
				min={0}
				disabled={done}
			/>
			{e1rm > 0 && (
				<span className="hidden w-14 shrink-0 text-right font-mono text-[10px] text-ink-faint tabular-nums sm:inline">
					e1RM {e1rm.toFixed(0)}
				</span>
			)}
			{rpe != null && (
				<span className="hidden w-10 shrink-0 font-mono text-[10px] text-ink-muted tabular-nums sm:inline">
					@{rpe}
				</span>
			)}
			{failureFlag === 1 && <span className="text-[10px] text-destructive">F</span>}
			{onConfirm && (
				<button
					type="button"
					className={cn(
						'ml-auto flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
						done
							? `${CONFIRM_BORDER_STYLES[setType]} hover:opacity-60`
							: 'border-edge text-ink-faint hover:border-ink-muted hover:text-ink-muted'
					)}
					onClick={onConfirm}
					data-confirm-pending={done ? undefined : ''}
				>
					{done ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
				</button>
			)}
		</div>
	)
}
