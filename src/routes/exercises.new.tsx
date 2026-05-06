import { prefetchRoute } from '~/lib'

export { ExerciseDetailPage as default } from '~/features/exercises/ExerciseDetailPage'

export const clientLoader = () => prefetchRoute(utils => [utils.workout.listExercises.ensureData()])
