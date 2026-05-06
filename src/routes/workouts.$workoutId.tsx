import type { TypeIDString } from '@macromaxxing/db'
import { prefetchRoute } from '~/lib'
import type { Route } from './+types/workouts.$workoutId'

export { WorkoutTemplatePage as default } from '~/features/workouts/WorkoutTemplatePage'

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
	prefetchRoute(utils => [
		utils.workout.getWorkout.ensureData({ id: params.workoutId as TypeIDString<'wkt'> }),
		utils.workout.listExercises.ensureData(),
		utils.settings.getProfile.ensureData()
	])
