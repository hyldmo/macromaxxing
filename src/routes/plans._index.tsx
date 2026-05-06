import type { FC } from 'react'
import { MealPlansSection } from '~/features/mealPlans/MealPlansSection'
import { ProgramsSection } from '~/features/workouts/components/ProgramsSection'
import { prefetchRoute, useDocumentTitle } from '~/lib'

export const clientLoader = () =>
	prefetchRoute(utils => [
		utils.mealPlan.list.ensureData(),
		utils.workout.listPrograms.ensureData(),
		utils.dashboard.summary.ensureData()
	])

const PlansPage: FC = () => {
	useDocumentTitle('Plans')
	return (
		<div className="space-y-8">
			<MealPlansSection />
			<ProgramsSection />
		</div>
	)
}

export default PlansPage
