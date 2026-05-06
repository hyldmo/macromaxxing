import type { TypeIDString } from '@macromaxxing/db'
import { prefetchRoute } from '~/lib'
import type { Route } from './+types/workouts.sessions.$sessionId'

export { WorkoutSessionPage as default } from '~/features/workouts/WorkoutSessionPage'

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
	prefetchRoute(utils => [
		utils.workout.getSession.ensureData({ id: params.sessionId as TypeIDString<'wks'> }),
		utils.workout.listExercises.ensureData(),
		utils.workout.listStandards.ensureData()
	])
