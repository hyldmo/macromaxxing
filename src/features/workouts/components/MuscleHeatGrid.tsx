import type { MuscleGroup } from '@macromaxxing/db'
import { type FC, useMemo } from 'react'
import { Spinner } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { BodyMap } from './BodyMap'

export const MuscleHeatGrid: FC = () => {
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
				renderTooltip={muscle => {
					const stat = coverageQuery.data.find(s => s.muscleGroup === muscle)
					if (!stat) return null
					return (
						<div className="font-mono text-[10px] text-ink-muted tabular-nums">
							{stat.weeklySets.toFixed(1)} effective sets/wk
						</div>
					)
				}}
			/>
		</div>
	) : null
}
