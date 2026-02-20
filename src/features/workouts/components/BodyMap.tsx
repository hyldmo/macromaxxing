import type { MuscleGroup, Sex } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'
import { type FC, type ReactNode, type SVGAttributes, useMemo, useRef, useState } from 'react'
import { BodyBackFemale, BodyBackMale, BodyFrontFemale, BodyFrontMale, type BodySvgProps } from '~/components/ui'
import { intensityClass } from '~/lib'

export interface BodyMapProps {
	muscleVolumes: Map<MuscleGroup, number>
	sex: Sex
	renderTooltip?: (muscleGroup: MuscleGroup) => ReactNode
}

const BodyFigure: FC<{
	SvgComponent: FC<BodySvgProps>
	muscleColors: Map<MuscleGroup, string>
	onHover: (muscle: MuscleGroup | null) => void
	label: string
}> = ({ SvgComponent, muscleColors, onHover, label }) => {
	const gp = (muscle: MuscleGroup): SVGAttributes<SVGGElement> => ({
		className: `cursor-pointer transition-colors hover:opacity-70 ${
			muscleColors.get(muscle) ?? 'text-ink-faint/20'
		}`,
		onMouseEnter: () => onHover(muscle),
		onMouseLeave: () => onHover(null)
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

export const BodyMap: FC<BodyMapProps> = ({ muscleVolumes, sex, renderTooltip }) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [hoveredMuscle, setHoveredMuscle] = useState<MuscleGroup | null>(null)
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

	return (
		<div
			ref={containerRef}
			role="img"
			aria-label="Muscle coverage preview"
			className="relative"
			onMouseMove={handleMouseMove}
		>
			<div className="flex justify-center gap-4">
				<BodyFigure SvgComponent={Front} muscleColors={muscleColors} onHover={setHoveredMuscle} label="front" />
				<BodyFigure SvgComponent={Back} muscleColors={muscleColors} onHover={setHoveredMuscle} label="back" />
			</div>
			{hoveredMuscle && (
				<div
					className="pointer-events-none absolute z-10 w-36 rounded-sm border border-edge bg-surface-1 p-2"
					style={{ left: mousePos.x - 144, top: mousePos.y + 16 }}
				>
					<div className="font-medium text-ink text-xs">{startCase(hoveredMuscle)}</div>
					{tooltipContent}
				</div>
			)}
		</div>
	)
}
