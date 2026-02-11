import { type FC, useMemo, useRef, useState } from 'react'
import { Spinner } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { BodyMap } from './BodyMap'

export const MuscleHeatGrid: FC = () => {
	const coverageQuery = trpc.workout.coverageStats.useQuery()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
	const containerRef = useRef<HTMLDivElement>(null)
	const sex = profileQuery.data?.sex ?? 'male'

	const muscleColors = useMemo(() => {
		if (!coverageQuery.data) return new Map<string, string>()
		const max = Math.max(...coverageQuery.data.map(s => s.weeklySets), 1)
		const colors = new Map<string, string>()
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

/** Map 0-1 intensity to macro color classes (red=low → green=high) */
function intensityClass(t: number): string {
	if (t < 0.33) return 'text-macro-kcal'
	if (t < 0.66) return 'text-macro-fat'
	if (t < 0.85) return 'text-macro-carbs'
	return 'text-macro-protein'
}

const MUSCLE_LABELS: Record<string, string> = {
	chest: 'Chest',
	upper_back: 'Upper Back',
	lats: 'Lats',
	front_delts: 'Front Delts',
	side_delts: 'Side Delts',
	rear_delts: 'Rear Delts',
	biceps: 'Biceps',
	triceps: 'Triceps',
	forearms: 'Forearms',
	quads: 'Quads',
	hamstrings: 'Hamstrings',
	glutes: 'Glutes',
	calves: 'Calves',
	core: 'Core'
}
