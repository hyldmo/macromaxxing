import { aiRouter } from './routes/ai'
import { analyticsRouter } from './routes/analytics'
import { dashboardRouter } from './routes/dashboard'
import { ingredientsRouter } from './routes/ingredients'
import { mealPlansRouter } from './routes/mealPlans'
import { recipesRouter } from './routes/recipes'
import { settingsRouter } from './routes/settings'
import { userRouter } from './routes/user'
import { workoutsRouter } from './routes/workouts'
import { router } from './trpc'

export const appRouter = router({
	recipe: recipesRouter,
	ingredient: ingredientsRouter,
	settings: settingsRouter,
	ai: aiRouter,
	dashboard: dashboardRouter,
	mealPlan: mealPlansRouter,
	user: userRouter,
	workout: workoutsRouter,
	analytics: analyticsRouter
})

export type AppRouter = typeof appRouter
