import type { MuscleGroup } from '@macromaxxing/db'
import { type FC, useMemo } from 'react'
import { Spinner } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { BodyMap } from './BodyMap'

export interface MuscleHeatGridProps {
	/** When provided, the body map becomes interactive — clicking a muscle invokes this. */
	onMuscleClick?: (muscle: MuscleGroup) => void
	/** Currently selected muscle (for visual emphasis via tooltip copy). */
	activeMuscle?: MuscleGroup | null
}

export const MuscleHeatGrid: FC<MuscleHeatGridProps> = ({ onMuscleClick, activeMuscle }) => {
	const coverageQuery = trpc.workout.coverageStats.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const sex = profileQuery.data?.sex ?? 'male'

	const muscleVolumes = useMemo(() => {
		if (!coverageQuery.data) return new Map<MuscleGroup, number>()
		const volumes = new Map<MuscleGroup, number>()
		for (const s of coverageQuery.data) {
			if (s.weeklySets > 0) {
				volumes.set(s.muscleGroup, s.weeklySets)
			}
		}
		return volumes
	}, [coverageQuery.data])

	return coverageQuery.isLoading ? (
		<div className="flex justify-center py-6">
			<Spinner />
		</div>
	) : coverageQuery.data ? (
		<div className="py-12">
			<BodyMap
				muscleVolumes={muscleVolumes}
				sex={sex}
				onMuscleClick={onMuscleClick}
				renderTooltip={muscle => {
					const stat = coverageQuery.data.find(s => s.muscleGroup === muscle)
					const isActive = activeMuscle === muscle
					return (
						<div className="space-y-0.5">
							{stat && (
								<div className="font-mono text-[10px] text-ink-muted tabular-nums">
									{stat.weeklySets.toFixed(1)} effective sets/wk
								</div>
							)}
							{onMuscleClick && (
								<div className="font-mono text-[10px] text-ink-faint">
									{isActive ? 'Click to clear filter' : 'Click to filter'}
								</div>
							)}
						</div>
					)
				}}
			/>
		</div>
	) : null
}
