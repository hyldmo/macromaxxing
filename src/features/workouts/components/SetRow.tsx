import type { SetType } from '@macromaxxing/db'
import { Check, Circle } from 'lucide-react'
import type { FC } from 'react'
import { NumberInput } from '~/components/ui/NumberInput'
import { cn } from '~/lib/cn'
import type { RouterOutput } from '~/lib/trpc'
import { estimated1RM } from '../utils/formulas'

type Log = RouterOutput['workout']['getSession']['logs'][number]

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
	log: Log
	onUpdate: (id: Log['id'], updates: { weightKg?: number; reps?: number; rpe?: number | null }) => void
	onRemove: (id: Log['id']) => void
}

export const SetRow: FC<SetRowProps> = ({ log, onUpdate, onRemove }) => {
	const e1rm = log.reps > 0 ? estimated1RM(log.weightKg, log.reps) : 0

	return (
		<div className="flex items-center gap-1.5 py-0.5 sm:gap-2">
			<span
				className={cn(
					'w-7 shrink-0 rounded-full px-1 py-0.5 text-center font-mono text-[10px] sm:w-16 sm:px-1.5',
					SET_TYPE_STYLES[log.setType]
				)}
			>
				<span className="hidden sm:inline">{log.setType}</span>
				<span className="sm:hidden">{log.setType[0].toUpperCase()}</span>
			</span>
			<NumberInput
				className="w-16 sm:w-20"
				value={log.weightKg}
				onChange={e => {
					const v = Number.parseFloat(e.target.value)
					if (!Number.isNaN(v)) onUpdate(log.id, { weightKg: v })
				}}
				unit="kg"
				step={2.5}
				min={0}
			/>
			<span className="text-ink-faint text-xs">×</span>
			<NumberInput
				className="w-12 sm:w-16"
				value={log.reps}
				onChange={e => {
					const v = Number.parseInt(e.target.value, 10)
					if (!Number.isNaN(v)) onUpdate(log.id, { reps: v })
				}}
				unit="r"
				step={1}
				min={0}
			/>
			<span className="hidden w-14 shrink-0 text-right font-mono text-[10px] text-ink-faint tabular-nums sm:inline">
				{e1rm > 0 ? `e1RM ${e1rm.toFixed(0)}` : ''}
			</span>
			{log.rpe != null && (
				<span className="hidden w-10 shrink-0 font-mono text-[10px] text-ink-muted tabular-nums sm:inline">
					@{log.rpe}
				</span>
			)}
			{log.failureFlag === 1 && <span className="text-[10px] text-destructive">F</span>}
			<button
				type="button"
				className={cn(
					'ml-auto flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors hover:opacity-60',
					CONFIRM_BORDER_STYLES[log.setType]
				)}
				onClick={() => onRemove(log.id)}
			>
				<Check className="size-3.5" />
			</button>
		</div>
	)
}

/** Planned set row: shows target, tap to confirm */
export interface PlannedSetRowProps {
	setNumber: number
	weightKg: number | null
	reps: number
	setType?: SetType
	done: boolean
	onConfirm: (weightKg: number, reps: number) => void
	onWeightChange: (weight: number | null) => void
	onRepsChange: (reps: number) => void
}

export const PlannedSetRow: FC<PlannedSetRowProps> = ({
	setNumber: _setNumber,
	weightKg,
	reps,
	setType = 'working',
	done,
	onConfirm,
	onWeightChange,
	onRepsChange
}) => (
	<div className="flex items-center gap-1.5 rounded-[--radius-sm] py-1 sm:gap-2">
		{/* Type badge */}
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
			className="w-12 sm:w-16"
			value={reps}
			onChange={e => {
				const v = Number.parseInt(e.target.value, 10)
				if (!Number.isNaN(v) && v >= 0) onRepsChange(v)
			}}
			step={1}
			min={0}
			disabled={done}
		/>
		<span className="text-ink-faint text-xs">×</span>
		<NumberInput
			className="w-16 sm:w-20"
			value={weightKg ?? ''}
			placeholder="kg"
			unit="kg"
			onChange={e => {
				const v = Number.parseFloat(e.target.value)
				onWeightChange(Number.isNaN(v) ? null : v)
			}}
			step={2.5}
			min={0}
			disabled={done}
		/>
		{/* Confirm button */}
		<button
			type="button"
			className={cn(
				'ml-auto flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
				done
					? CONFIRM_BORDER_STYLES[setType]
					: 'border-edge text-ink-faint hover:border-ink-muted hover:text-ink-muted'
			)}
			onClick={() => {
				if (!done) onConfirm(weightKg ?? 0, reps)
			}}
			disabled={done}
		>
			{done ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
		</button>
	</div>
)
