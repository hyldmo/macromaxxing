import { aiRouter } from './routes/ai'
import { ingredientsRouter } from './routes/ingredients'
import { mealPlansRouter } from './routes/mealPlans'
import { recipesRouter } from './routes/recipes'
import { settingsRouter } from './routes/settings'
import { userRouter } from './routes/user'
import { router } from './trpc'

export const appRouter = router({
	recipe: recipesRouter,
	ingredient: ingredientsRouter,
	settings: settingsRouter,
	ai: aiRouter,
	mealPlan: mealPlansRouter,
	user: userRouter
})

export type AppRouter = typeof appRouter
