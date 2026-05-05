import { createBrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from '~/components/ErrorBoundary'
import { RootLayout } from '~/components/layout/RootLayout'
import { AnalyticsPage } from '~/features/analytics'
import { DashboardPage } from '~/features/dashboard/DashboardPage'
import { ExerciseDetailPage, ExerciseListPage } from '~/features/exercises'
import { IngredientListPage } from '~/features/ingredients'
import { MealPlannerPage } from '~/features/mealPlans/MealPlannerPage'
import { PlansPage } from '~/features/mealPlans/PlansPage'
import { CookModePage } from '~/features/recipes/CookModePage'
import { RecipeEditorPage } from '~/features/recipes/RecipeEditorPage'
import { RecipeListPage } from '~/features/recipes/RecipeListPage'
import { SettingsPage } from '~/features/settings/SettingsPage'
import { ProgramEditor } from '~/features/workouts/components/ProgramEditor'
import { TimerMode } from '~/features/workouts/components/TimerMode'
import { WorkoutListPage } from '~/features/workouts/WorkoutListPage'
import { WorkoutSessionPage } from '~/features/workouts/WorkoutSessionPage'
import { WorkoutTemplatePage } from '~/features/workouts/WorkoutTemplatePage'

export const router = createBrowserRouter([
	{
		element: <RootLayout />,
		children: [
			{ index: true, element: <DashboardPage />, errorElement: <ErrorBoundary /> },
			{ path: 'recipes', element: <RecipeListPage />, errorElement: <ErrorBoundary /> },
			{ path: 'recipes/new', element: <RecipeEditorPage />, errorElement: <ErrorBoundary /> },
			{ path: 'recipes/:id', element: <RecipeEditorPage />, errorElement: <ErrorBoundary /> },
			{ path: 'recipes/:id/cook', element: <CookModePage />, errorElement: <ErrorBoundary /> },
			{ path: 'ingredients', element: <IngredientListPage />, errorElement: <ErrorBoundary /> },
			{ path: 'exercises', element: <ExerciseListPage />, errorElement: <ErrorBoundary /> },
			{ path: 'exercises/new', element: <ExerciseDetailPage />, errorElement: <ErrorBoundary /> },
			{ path: 'exercises/:id', element: <ExerciseDetailPage />, errorElement: <ErrorBoundary /> },
			{ path: 'plans', element: <PlansPage />, errorElement: <ErrorBoundary /> },
			{ path: 'plans/programs/new', element: <ProgramEditor />, errorElement: <ErrorBoundary /> },
			{ path: 'plans/programs/:id', element: <ProgramEditor />, errorElement: <ErrorBoundary /> },
			{ path: 'plans/:id', element: <MealPlannerPage />, errorElement: <ErrorBoundary /> },
			{ path: 'workouts', element: <WorkoutListPage />, errorElement: <ErrorBoundary /> },
			{ path: 'workouts/new', element: <WorkoutTemplatePage />, errorElement: <ErrorBoundary /> },
			{ path: 'workouts/:workoutId', element: <WorkoutTemplatePage />, errorElement: <ErrorBoundary /> },
			{ path: 'workouts/:workoutId/session', element: <WorkoutSessionPage />, errorElement: <ErrorBoundary /> },
			{
				path: 'workouts/sessions/:sessionId',
				element: <WorkoutSessionPage />,
				errorElement: <ErrorBoundary />,
				children: [{ path: 'timer', element: <TimerMode /> }]
			},
			{ path: 'analytics', element: <AnalyticsPage />, errorElement: <ErrorBoundary /> },
			{ path: 'settings', element: <SettingsPage />, errorElement: <ErrorBoundary /> }
		]
	}
])
