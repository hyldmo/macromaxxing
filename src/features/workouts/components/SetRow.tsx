import type { SetType } from '@macromaxxing/db'
import { Check, Circle } from 'lucide-react'
import type { FC } from 'react'
import { NumberInput } from '~/components/ui'
import { cn, effectiveSetWeightKg, estimated1RM, isE1rmPR, METRIC_LABEL, METRIC_UNIT, SET_TYPE_STYLES } from '~/lib'

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
	failureFlag?: boolean | null
	/** 0 = absolute load; >0 = fraction of bodyweight (weight field is added kg only). */
	bwMultiplier?: number
	bodyWeightKg?: number | null
	/** `added` for planned/input rows; `stored` for confirmed logs (effective kg). */
	weightInput?: 'added' | 'stored'
	/**
	 * Prior best e1RM for this exercise — used to flag PRs on confirmed working sets.
	 * v1 sources this from `lastSession.topE1rm` (most-recent-session best, not all-time max).
	 * Loose enough to false-positive after a deload week, but precise enough for the inline
	 * "you beat last time" acknowledgement. A future task may swap in a true all-time max.
	 */
	priorMaxE1rm?: number | null
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
	bwMultiplier = 0,
	bodyWeightKg,
	weightInput = 'added',
	priorMaxE1rm,
	onWeightChange,
	onRepsChange,
	onConfirm
}) => {
	const isBw = bwMultiplier > 0
	const effectiveWeight =
		weightInput === 'stored' || !isBw
			? (weightKg ?? 0)
			: effectiveSetWeightKg(bwMultiplier, bodyWeightKg ?? null, weightKg ?? 0)
	const e1rm = reps > 0 && effectiveWeight > 0 ? estimated1RM(effectiveWeight, reps) : 0
	const isPR =
		done &&
		setType === 'working' &&
		priorMaxE1rm != null &&
		priorMaxE1rm > 0 &&
		isE1rmPR({ weightKg: effectiveWeight, reps }, priorMaxE1rm)
	const weightDisabled = done || (weightInput === 'stored' && isBw)

	return (
		<div className={cn('flex items-center gap-1.5 rounded-sm py-0.5 sm:gap-2', active && 'bg-surface-2')}>
			<span
				className={cn(
					'w-7 xs:w-16 shrink-0 rounded-full px-1 xs:px-1.5 py-0.5 text-center font-mono text-[10px]',
					SET_TYPE_STYLES[setType]
				)}
			>
				<span className="xs:inline hidden">{setType}</span>
				<span className="xs:hidden">{setType[0].toUpperCase()}</span>
			</span>
			<NumberInput
				className="w-24"
				value={weightKg ?? ''}
				placeholder={isBw && weightInput === 'added' ? '+kg' : 'kg'}
				unit="kg"
				onChange={e => {
					const v = Number.parseFloat(e.target.value)
					onWeightChange?.(Number.isNaN(v) ? null : v)
				}}
				step={2.5}
				min={0}
				disabled={weightDisabled}
			/>
			<span className="text-ink-faint text-xs">×</span>
			<NumberInput
				className="w-16"
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
				<span
					className={cn(
						'hidden w-14 shrink-0 text-right font-mono text-[10px] tabular-nums sm:inline',
						isPR ? 'text-success' : 'text-ink-faint'
					)}
				>
					{isPR && '↑ '}
					{METRIC_LABEL.e1rm} {e1rm.toFixed(0)}
					{METRIC_UNIT.e1rm}
				</span>
			)}
			{rpe != null && (
				<span className="hidden w-10 shrink-0 font-mono text-[10px] text-ink-muted tabular-nums sm:inline">
					@{rpe}
				</span>
			)}
			{failureFlag && <span className="text-[10px] text-destructive">F</span>}
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
