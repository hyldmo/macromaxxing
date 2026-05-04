import type { MuscleGroup } from '@macromaxxing/db'
import type { SVGAttributes } from 'react'
export interface BodySvgProps {
	gp?: (id: MuscleGroup) => SVGAttributes<SVGGElement>
}
