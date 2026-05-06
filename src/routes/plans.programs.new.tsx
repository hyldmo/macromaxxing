import { prefetchRoute } from '~/lib'

export { ProgramEditor as default } from '~/features/workouts/components/ProgramEditor'

export const clientLoader = () => prefetchRoute(utils => [utils.workout.listWorkouts.ensureData()])
