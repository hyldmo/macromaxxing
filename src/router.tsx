import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from '~/components/layout/RootLayout'
import { IngredientListPage } from '~/features/ingredients/IngredientListPage'
import { RecipeEditorPage } from '~/features/recipes/RecipeEditorPage'
import { RecipeListPage } from '~/features/recipes/RecipeListPage'
import { SettingsPage } from '~/features/settings/SettingsPage'

export const router = createBrowserRouter([
	{
		element: <RootLayout />,
		children: [
			{ index: true, element: <Navigate to="/recipes" replace /> },
			{ path: 'recipes', element: <RecipeListPage /> },
			{ path: 'recipes/new', element: <RecipeEditorPage /> },
			{ path: 'recipes/:id', element: <RecipeEditorPage /> },
			{ path: 'ingredients', element: <IngredientListPage /> },
			{ path: 'settings', element: <SettingsPage /> }
		]
	}
])
