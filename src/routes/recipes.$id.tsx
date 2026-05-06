import type { Recipe } from '@macromaxxing/db'
import { prefetchRoute } from '~/lib'
import type { Route } from './+types/recipes.$id'

export { RecipeEditorPage as default } from '~/features/recipes/RecipeEditorPage'

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
	prefetchRoute(utils => [utils.recipe.get.ensureData({ id: params.id as Recipe['id'] })])
