import type { BalanceRatio, MuscleGroup } from '@macromaxxing/db'
import { type FC, useMemo } from 'react'
import { Card } from '~/components/ui'
import { cn, computeProgramLoad } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
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

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]

interface ProgramMuscleSidebarProps {
	workouts: readonly WorkoutTemplate[]
}

export const ProgramMuscleSidebar: FC<ProgramMuscleSidebarProps> = ({ workouts }) => {
	const profileQuery = trpc.settings.getProfile.useQuery()
	const sex = profileQuery.data?.sex ?? 'male'

	const load = useMemo(() => computeProgramLoad(workouts), [workouts])

	const muscleVolumes = useMemo(() => {
		const volumes = new Map<MuscleGroup, number>()
		for (const m of load.muscles) {
			if (m.workingSets > 0) volumes.set(m.muscleGroup, m.workingSets)
		}
		return volumes
	}, [load.muscles])

	if (workouts.length === 0) {
		return (
			<Card className="p-4 text-center text-ink-faint text-sm">
				Add workouts to see muscle coverage across the cycle.
			</Card>
		)
	}

	return (
		<div className="space-y-3">
			<Card className="p-3">
				<div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
					<div className="text-ink-faint">Workouts</div>
					<div className="text-right text-ink">{workouts.length}</div>
					<div className="text-ink-faint">Exercises</div>
					<div className="text-right text-ink">{load.exerciseCount}</div>
					<div className="text-ink-faint">Working sets</div>
					<div className="text-right text-ink">{load.totals.workingSets.toFixed(0)}</div>
					<div className="text-ink-faint">Compound · Iso</div>
					<div className="text-right text-ink">
						{load.totals.compoundSets.toFixed(0)} · {load.totals.isolationSets.toFixed(0)}
					</div>
				</div>
			</Card>

			<Card className="p-1">
				<BodyMap
					muscleVolumes={muscleVolumes}
					sex={sex}
					renderTooltip={muscle => {
						const m = load.muscles.find(x => x.muscleGroup === muscle)
						if (!m) return null
						return (
							<div className="space-y-0.5 font-mono text-[10px] text-ink-muted tabular-nums">
								<div>{m.workingSets.toFixed(1)} effective sets/cycle</div>
								<div className="text-ink-faint">
									zone: {m.zone.replace('_', ' ')} · MEV {m.landmark.mev}
								</div>
							</div>
						)
					}}
				/>
			</Card>

			{load.balances.length > 0 && (
				<Card className="space-y-3 p-3">
					<div className="font-medium text-ink text-xs">Balance</div>
					{load.balances.map(b => (
						<BalanceBar key={b.name} balance={b} />
					))}
				</Card>
			)}
		</div>
	)
}

export const BelowMevWarning: FC<ProgramMuscleSidebarProps> = ({ workouts }) => {
	const load = useMemo(() => computeProgramLoad(workouts), [workouts])
	if (load.belowMev.length === 0) return null
	return (
		<Card className="space-y-1 border-amber-500/40 bg-amber-500/5 p-3">
			<div className="font-medium text-ink text-xs">Below MEV</div>
			<div className="font-mono text-ink-muted text-xs tabular-nums">
				{load.belowMev.map(m => m.muscleGroup.replace('_', ' ')).join(', ')}
			</div>
			<p className="text-ink-faint text-xs">
				These muscles get fewer sets/cycle than the minimum effective volume.
			</p>
		</Card>
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
