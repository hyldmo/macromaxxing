import type { MuscleGroup, Sex } from '@macromaxxing/db'
import type { FC, SVGAttributes } from 'react'
import { BodyBackFemale, BodyBackMale, BodyFrontFemale, BodyFrontMale, type BodySvgProps } from '~/components/ui'

export interface BodyMapProps {
	muscleColors: Map<MuscleGroup, string>
	onHover: (muscleGroup: MuscleGroup | null) => void
	sex: Sex
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

export const BodyMap: FC<BodyMapProps> = ({ muscleColors, onHover, sex }) => {
	const Front = sex === 'female' ? BodyFrontFemale : BodyFrontMale
	const Back = sex === 'female' ? BodyBackFemale : BodyBackMale
	return (
		<div className="flex justify-center gap-4">
			<BodyFigure SvgComponent={Front} muscleColors={muscleColors} onHover={onHover} label="front" />
			<BodyFigure SvgComponent={Back} muscleColors={muscleColors} onHover={onHover} label="back" />
		</div>
	)
}
