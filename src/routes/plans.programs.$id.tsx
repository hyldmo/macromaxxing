import type { TypeIDString } from '@macromaxxing/db'
import { prefetchRoute } from '~/lib'
import type { Route } from './+types/plans.programs.$id'

export { ProgramEditor as default } from '~/features/workouts/components/ProgramEditor'

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
	prefetchRoute(utils => [
		utils.workout.getProgram.ensureData({ id: params.id as TypeIDString<'wpr'> }),
		utils.workout.listWorkouts.ensureData()
	])
