import { type FC, useMemo } from 'react'
import { Card } from '~/components/ui'
import { computeProgramLoad } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'
import { METRIC_LABEL, METRIC_UNIT } from '~/lib/workouts/constants'
import { programCycleDays } from '~/lib/workouts/programRest'
import { estimateWorkoutDurationSec } from '~/lib/workouts/sets'
import { MuscleLoadPanel } from './MuscleLoadPanel'

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]

interface ProgramMuscleSidebarProps {
	workouts: readonly WorkoutTemplate[]
}

export const ProgramMuscleSidebar: FC<ProgramMuscleSidebarProps> = ({ workouts }) => {
	const profileQuery = trpc.settings.getProfile.useQuery()
	const sex = profileQuery.data?.sex ?? 'male'
	const bodyWeightKg = profileQuery.data?.weightKg ?? null

	const load = useMemo(() => computeProgramLoad(workouts, bodyWeightKg), [workouts, bodyWeightKg])
	const cycleDays = useMemo(() => programCycleDays(workouts), [workouts])
	const avgSessionMin = useMemo(() => {
		if (workouts.length === 0) return 0
		const total = workouts.reduce((sum, w) => sum + estimateWorkoutDurationSec(w), 0)
		return Math.round(total / workouts.length / 60)
	}, [workouts])

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
					<div className="text-ink-faint">Cycle length</div>
					<div
						className="text-right text-ink"
						title="Sum of recovery hours across all cycle transitions (≥24h each), rounded up to days"
					>
						{cycleDays} {cycleDays === 1 ? 'day' : 'days'}
					</div>
					<div className="text-ink-faint">Avg session</div>
					<div
						className="text-right text-ink"
						title="Estimated time per workout: 1 min per set + calculated inter-set rest + 3 min between exercises"
					>
						{avgSessionMin} min
					</div>
					<div className="text-ink-faint">Exercises</div>
					<div className="text-right text-ink">{load.exerciseCount}</div>
					<div className="text-ink-faint">Working sets</div>
					<div className="text-right text-ink">{load.totals.workingSets.toFixed(0)}</div>
					<div className="text-ink-faint">Compound · Iso</div>
					<div className="text-right text-ink">
						{load.totals.compoundSets.toFixed(0)} · {load.totals.isolationSets.toFixed(0)}
					</div>
					{load.totals.volumeKg > 0 && (
						<>
							<div className="text-ink-faint">{METRIC_LABEL.volume}</div>
							<div
								className="text-right text-ink"
								title="Σ(weight × reps × sets × intensity) across one cycle"
							>
								{Math.round(load.totals.volumeKg).toLocaleString()} {METRIC_UNIT.volume}
							</div>
						</>
					)}
				</div>
			</Card>

			<MuscleLoadPanel muscles={load.muscles} balances={load.balances} sex={sex} unitLabel="sets/cycle" />
		</div>
	)
}

export const BelowMevWarning: FC<ProgramMuscleSidebarProps> = ({ workouts }) => {
	const profileQuery = trpc.settings.getProfile.useQuery()
	const bodyWeightKg = profileQuery.data?.weightKg ?? null
	const load = useMemo(() => computeProgramLoad(workouts, bodyWeightKg), [workouts, bodyWeightKg])
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
