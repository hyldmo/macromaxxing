import type { MuscleGroup, Sex } from '@macromaxxing/db'
import { clamp, startCase } from 'es-toolkit'
import { type FC, type ReactNode, type SVGAttributes, useMemo, useRef, useState } from 'react'
import { BodyBackFemale, BodyBackMale, BodyFrontFemale, BodyFrontMale, type BodySvgProps } from '~/components/ui/body'
import { intensityClass } from '~/lib/workouts/muscles'

export interface BodyMapProps {
	muscleVolumes: Map<MuscleGroup, number>
	sex: Sex
	renderTooltip?: (muscleGroup: MuscleGroup) => ReactNode
	/** When provided, muscles become clickable (e.g. to filter by muscle group). */
	onMuscleClick?: (muscle: MuscleGroup) => void
	/** Highlighted muscle (outline ring), e.g. the active filter selection. */
	selectedMuscle?: MuscleGroup | null
}

const BodyFigure: FC<{
	SvgComponent: FC<BodySvgProps>
	muscleColors: Map<MuscleGroup, string>
	onHover: (muscle: MuscleGroup | null) => void
	onMuscleClick?: (muscle: MuscleGroup) => void
	selectedMuscle?: MuscleGroup | null
	label: string
}> = ({ SvgComponent, muscleColors, onHover, onMuscleClick, selectedMuscle, label }) => {
	const gp = (muscle: MuscleGroup): SVGAttributes<SVGGElement> => ({
		className: `transition-colors hover:opacity-70 ${onMuscleClick ? 'cursor-pointer' : 'cursor-default'} ${
			selectedMuscle === muscle ? 'text-accent' : (muscleColors.get(muscle) ?? 'text-ink-faint/20')
		}`,
		onMouseEnter: () => onHover(muscle),
		onMouseLeave: () => onHover(null),
		onClick: onMuscleClick ? () => onMuscleClick(muscle) : undefined
	})

	return (
		<div className="flex flex-col items-center gap-1">
			<div className="h-52">
				<SvgComponent gp={gp} />
			</div>
			<span className="font-mono text-[10px] text-ink-faint">{label}</span>
		</div>
	)
}

export const BodyMap: FC<BodyMapProps> = ({ muscleVolumes, sex, renderTooltip, onMuscleClick, selectedMuscle }) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [hoveredMuscle, setHoveredMuscle] = useState<MuscleGroup | null>(null)
	const tooltipRef = useRef<HTMLDivElement>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

	const muscleColors = useMemo(() => {
		const max = Math.max(...muscleVolumes.values(), 1)
		const colors = new Map<MuscleGroup, string>()
		for (const [muscle, volume] of muscleVolumes) {
			colors.set(muscle, intensityClass(volume / max))
		}
		return colors
	}, [muscleVolumes])

	function handleMouseMove(e: React.MouseEvent) {
		if (!containerRef.current) return
		const rect = containerRef.current.getBoundingClientRect()
		setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
	}

	const Front = sex === 'female' ? BodyFrontFemale : BodyFrontMale
	const Back = sex === 'female' ? BodyBackFemale : BodyBackMale

	const tooltipContent = hoveredMuscle ? renderTooltip?.(hoveredMuscle) : null
	const tooltipWidth = tooltipRef.current?.clientWidth ?? 144
	const tooltipHeight = tooltipRef.current?.clientHeight ?? 16

	return (
		<div
			ref={containerRef}
			role="img"
			aria-label="Muscle coverage preview"
			className="relative"
			onMouseMove={handleMouseMove}
		>
			<div className="flex justify-center gap-4">
				<BodyFigure
					SvgComponent={Front}
					muscleColors={muscleColors}
					onHover={setHoveredMuscle}
					onMuscleClick={onMuscleClick}
					selectedMuscle={selectedMuscle}
					label="front"
				/>
				<BodyFigure
					SvgComponent={Back}
					muscleColors={muscleColors}
					onHover={setHoveredMuscle}
					onMuscleClick={onMuscleClick}
					selectedMuscle={selectedMuscle}
					label="back"
				/>
			</div>
			{hoveredMuscle && (
				<div
					className="pointer-events-none absolute z-90 w-36 rounded-sm border border-edge bg-surface-1 p-2"
					ref={tooltipRef}
					style={{
						left: clamp(mousePos.x - tooltipWidth, 0, window.innerWidth - tooltipWidth),
						top: clamp(mousePos.y + 16, 0, window.innerHeight - tooltipHeight)
					}}
				>
					<div className="font-medium text-ink text-xs">{startCase(hoveredMuscle)}</div>
					{tooltipContent}
				</div>
			)}
		</div>
	)
}
