import type { BalanceRatio, MuscleGroup, MuscleLoadWithZone, Sex } from '@macromaxxing/db'
import { type FC, useMemo } from 'react'
import { Card } from '~/components/ui/Card'
import { cn } from '~/lib/cn'
import { BodyMap } from './BodyMap'

interface BalanceLabel {
	title: string
	numerator: string
	denominator: string
}

const BALANCE_LABELS: Record<string, BalanceLabel> = {
	push_pull: { title: 'Push vs Pull', numerator: 'Push', denominator: 'Pull' },
	quad_hamstring: { title: 'Quad vs Hamstring', numerator: 'Quad', denominator: 'Hamstring' },
	front_rear_delt: { title: 'Front vs Rear Delt', numerator: 'Front', denominator: 'Rear' },
	biceps_triceps: { title: 'Biceps vs Triceps', numerator: 'Biceps', denominator: 'Triceps' },
	anterior_posterior: { title: 'Anterior vs Posterior', numerator: 'Anterior', denominator: 'Posterior' }
}

export interface MuscleLoadPanelProps {
	muscles: readonly MuscleLoadWithZone[]
	balances: readonly BalanceRatio[]
	sex: Sex
	/** Volume unit shown in the body-map tooltip — 'sets/cycle' for a program, 'sets/wk' for one template. */
	unitLabel?: string
}

/**
 * The muscle-load visualization core — an interactive `BodyMap` (heat + zone tooltip) plus the
 * balance-ratio bars. Purely presentational: takes the already-computed per-muscle zones + balances
 * as props, so it renders identically whether fed by the client `computeProgramLoad` (in
 * `ProgramMuscleSidebar`) or a muscle-load tRPC tool result (the MCP Apps widget). No data fetching,
 * no router, no store — that's what lets it mount inside the sandboxed widget iframe unchanged.
 */
export const MuscleLoadPanel: FC<MuscleLoadPanelProps> = ({ muscles, balances, sex, unitLabel = 'sets' }) => {
	const muscleVolumes = useMemo(() => {
		const volumes = new Map<MuscleGroup, number>()
		for (const m of muscles) {
			if (m.workingSets > 0) volumes.set(m.muscleGroup, m.workingSets)
		}
		return volumes
	}, [muscles])

	return (
		<div className="space-y-3">
			<Card className="p-1">
				<BodyMap
					muscleVolumes={muscleVolumes}
					sex={sex}
					renderTooltip={muscle => {
						const m = muscles.find(x => x.muscleGroup === muscle)
						if (!m) return null
						return (
							<div className="space-y-0.5 font-mono text-[10px] text-ink-muted tabular-nums">
								<div>
									{m.workingSets.toFixed(1)} effective {unitLabel}
								</div>
								<div className="text-ink-faint">
									zone: {m.zone.replace('_', ' ')} · MEV {m.landmark.mev}
								</div>
							</div>
						)
					}}
				/>
			</Card>

			{balances.length > 0 && (
				<Card className="space-y-3 p-3">
					<div className="font-medium text-ink text-xs">Balance</div>
					{balances.map(b => (
						<BalanceBar key={b.name} balance={b} />
					))}
				</Card>
			)}
		</div>
	)
}

const BalanceBar: FC<{ balance: BalanceRatio }> = ({ balance }) => {
	const labels = BALANCE_LABELS[balance.name] ?? {
		title: balance.name,
		numerator: 'A',
		denominator: 'B'
	}
	const { ratio, idealMin, idealMax, numerator, denominator } = balance

	if (ratio === null) {
		return (
			<div className="space-y-1">
				<div className="flex items-baseline justify-between gap-2 text-xs">
					<span className="font-medium text-ink">{labels.title}</span>
					<span className="text-ink-faint">no data</span>
				</div>
			</div>
		)
	}

	const scaleMax = Math.max(2, idealMax + 0.5, ratio * 1.1)
	const inRange = ratio >= idealMin && ratio <= idealMax
	const status = inRange ? 'Balanced' : ratio > idealMax ? `${labels.numerator}-heavy` : `${labels.denominator}-heavy`

	const pct = (v: number) => `${(Math.min(v, scaleMax) / scaleMax) * 100}%`

	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-2 text-xs">
				<span className="font-medium text-ink">{labels.title}</span>
				<span className={inRange ? 'text-ink-muted' : 'text-amber-500'}>{status}</span>
			</div>
			<div className="relative h-2 w-full rounded-full bg-surface-2">
				<div
					className="absolute top-0 h-full rounded-full bg-accent/25"
					style={{
						left: pct(idealMin),
						width: `${((Math.min(idealMax, scaleMax) - idealMin) / scaleMax) * 100}%`
					}}
				/>
				<div
					className={cn(
						'absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2',
						inRange ? 'bg-accent' : 'bg-amber-500'
					)}
					style={{ left: pct(ratio) }}
					title={`Current ratio ${ratio.toFixed(2)}`}
				/>
			</div>
			<div className="flex justify-between font-mono text-[10px] text-ink-faint tabular-nums">
				<span>
					{numerator.toFixed(0)} vs {denominator.toFixed(0)} sets
				</span>
				<span>
					{ratio.toFixed(2)}× · target {idealMin}–{idealMax}×
				</span>
			</div>
		</div>
	)
}
