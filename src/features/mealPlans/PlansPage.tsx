import type { FC } from 'react'
import { ProgramsSection } from '~/features/workouts/components/ProgramsSection'
import { useDocumentTitle } from '~/lib'
import { MealPlansSection } from './MealPlansSection'

export const PlansPage: FC = () => {
	useDocumentTitle('Plans')
	return (
		<div className="space-y-8">
			<MealPlansSection />
			<ProgramsSection />
		</div>
	)
}
