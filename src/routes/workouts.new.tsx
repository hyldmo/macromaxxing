import { prefetchRoute } from '~/lib'

export { WorkoutTemplatePage as default } from '~/features/workouts/WorkoutTemplatePage'

export const clientLoader = () =>
	prefetchRoute(utils => [utils.workout.listExercises.ensureData(), utils.settings.getProfile.ensureData()])
