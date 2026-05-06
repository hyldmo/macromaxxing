import type { Exercise } from '@macromaxxing/db'
import { prefetchRoute } from '~/lib'
import type { Route } from './+types/exercises.$id'

export { ExerciseDetailPage as default } from '~/features/exercises/ExerciseDetailPage'

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => {
	const exerciseId = params.id as Exercise['id']
	return prefetchRoute(utils => [
		utils.workout.listExercises.ensureData(),
		utils.workout.exerciseHistory.ensureData({ exerciseId, window: '4w' }),
		utils.workout.exerciseHistory.ensureData({ exerciseId, window: '1y' })
	])
}
