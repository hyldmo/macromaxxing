import { prefetchRoute } from '~/lib'

export { WorkoutSessionPage as default } from '~/features/workouts/WorkoutSessionPage'

export const clientLoader = () =>
	prefetchRoute(utils => [utils.workout.listExercises.ensureData(), utils.workout.listStandards.ensureData()])
