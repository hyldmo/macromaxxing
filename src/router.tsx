import { createBrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from '~/components/ErrorBoundary'
import { RootLayout } from '~/components/layout/RootLayout'
import { DashboardPage } from '~/features/dashboard/DashboardPage'
import { IngredientListPage } from '~/features/ingredients'
import { MealPlanListPage } from '~/features/mealPlans/MealPlanListPage'
import { MealPlannerPage } from '~/features/mealPlans/MealPlannerPage'
import { CookModePage } from '~/features/recipes/CookModePage'
import { RecipeEditorPage } from '~/features/recipes/RecipeEditorPage'
import { RecipeListPage } from '~/features/recipes/RecipeListPage'
import { SettingsPage } from '~/features/settings/SettingsPage'
import { TimerMode } from '~/features/workouts/components/TimerMode'
import { WorkoutListPage } from '~/features/workouts/WorkoutListPage'
import { WorkoutSessionPage } from '~/features/workouts/WorkoutSessionPage'
import { WorkoutTemplatePage } from '~/features/workouts/WorkoutTemplatePage'

export const router = createBrowserRouter([
	{
		element: <RootLayout />,
		errorElement: <ErrorBoundary />,
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: 'recipes', element: <RecipeListPage /> },
			{ path: 'recipes/new', element: <RecipeEditorPage /> },
			{ path: 'recipes/:id', element: <RecipeEditorPage /> },
			{ path: 'recipes/:id/cook', element: <CookModePage /> },
			{ path: 'ingredients', element: <IngredientListPage /> },
			{ path: 'plans', element: <MealPlanListPage /> },
			{ path: 'plans/:id', element: <MealPlannerPage /> },
			{ path: 'workouts', element: <WorkoutListPage /> },
			{ path: 'workouts/new', element: <WorkoutTemplatePage /> },
			{ path: 'workouts/:workoutId', element: <WorkoutTemplatePage /> },
			{ path: 'workouts/:workoutId/session', element: <WorkoutSessionPage /> },
			{
				path: 'workouts/sessions/:sessionId',
				element: <WorkoutSessionPage />,
				children: [{ path: 'timer', element: <TimerMode /> }]
			},
			{ path: 'settings', element: <SettingsPage /> }
		]
	}
])
