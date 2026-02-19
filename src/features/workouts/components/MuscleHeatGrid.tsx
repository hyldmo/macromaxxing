import type { MuscleGroup } from '@macromaxxing/db'
import { type FC, useMemo, useRef, useState } from 'react'
import { Spinner } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { intensityClass, MUSCLE_LABELS } from '../utils/muscles'
import { BodyMap } from './BodyMap'

export const MuscleHeatGrid: FC = () => {
	const coverageQuery = trpc.workout.coverageStats.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const [hoveredMuscle, setHoveredMuscle] = useState<MuscleGroup | null>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
	const containerRef = useRef<HTMLDivElement>(null)
	const sex = profileQuery.data?.sex ?? 'male'

	const muscleColors = useMemo(() => {
		if (!coverageQuery.data) return new Map<MuscleGroup, string>()
		const max = Math.max(...coverageQuery.data.map(s => s.weeklySets), 1)
		const colors = new Map<MuscleGroup, string>()
		for (const s of coverageQuery.data) {
			if (s.weeklySets > 0) {
				colors.set(s.muscleGroup, intensityClass(s.weeklySets / max))
			}
		}
		return colors
	}, [coverageQuery.data])

	const hovered = hoveredMuscle ? coverageQuery.data?.find(s => s.muscleGroup === hoveredMuscle) : null

	function handleMouseMove(e: React.MouseEvent) {
		if (!containerRef.current) return
		const rect = containerRef.current.getBoundingClientRect()
		setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
	}

	return coverageQuery.isLoading ? (
		<div className="flex justify-center py-6">
			<Spinner />
		</div>
	) : coverageQuery.data ? (
		<div
			ref={containerRef}
			role="img"
			aria-label="Muscle coverage heatmap"
			className="relative py-12"
			onMouseMove={handleMouseMove}
		>
			<BodyMap muscleColors={muscleColors} onHover={setHoveredMuscle} sex={sex} />
			{hovered && hoveredMuscle && (
				<div
					className="pointer-events-none absolute z-10 w-36 rounded-sm border border-edge bg-surface-1 p-2"
					style={{ left: mousePos.x - 144, top: mousePos.y + 16 }}
				>
					<div className="font-medium text-ink text-xs">{MUSCLE_LABELS[hoveredMuscle] ?? hoveredMuscle}</div>
					<div className="mt-1 font-mono text-[10px] text-ink-muted tabular-nums">
						{hovered.weeklySets.toFixed(1)} effective sets/wk
					</div>
				</div>
			)}
		</div>
	) : null
}
