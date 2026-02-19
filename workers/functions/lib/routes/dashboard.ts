import {
	mealPlanInventory,
	mealPlans,
	recipes,
	workoutExercises,
	workoutLogs,
	workoutSessions,
	workouts
} from '@macromaxxing/db'
import { desc, eq, inArray } from 'drizzle-orm'
import { protectedProcedure, router } from '../trpc'

export const dashboardRouter = router({
	summary: protectedProcedure.query(async ({ ctx }) => {
		const [sessions, templates, plansShallow, planRecipes] = await Promise.all([
			// Recent workout sessions (3 levels — acceptable)
			ctx.db.query.workoutSessions.findMany({
				where: eq(workoutSessions.userId, ctx.user.id),
				with: {
					workout: true,
					logs: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutLogs.createdAt]
					}
				},
				orderBy: [desc(workoutSessions.startedAt)],
				limit: 5
			}),

			// Workout templates (3 levels — acceptable)
			ctx.db.query.workouts.findMany({
				where: eq(workouts.userId, ctx.user.id),
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutExercises.sortOrder]
					}
				},
				orderBy: [workouts.sortOrder]
			}),

			// Q1: Plans + inventory + slots (2 levels, shallow)
			ctx.db.query.mealPlans.findMany({
				where: eq(mealPlans.userId, ctx.user.id),
				with: { inventory: { with: { slots: true } } },
				orderBy: (mealPlans, { desc }) => [desc(mealPlans.updatedAt)]
			}),

			// Q2: All recipes referenced by user's plan inventory (3 levels, no dependency on Q1)
			ctx.db.query.recipes.findMany({
				where: inArray(
					recipes.id,
					ctx.db
						.select({ id: mealPlanInventory.recipeId })
						.from(mealPlanInventory)
						.innerJoin(mealPlans, eq(mealPlanInventory.mealPlanId, mealPlans.id))
						.where(eq(mealPlans.userId, ctx.user.id))
				),
				with: {
					recipeIngredients: {
						with: {
							ingredient: true,
							subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
						},
						orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
					}
				}
			})
		])

		// Assemble plans with recipes
		const recipeMap = new Map(planRecipes.map(r => [r.id, r]))
		const plans = plansShallow.map(plan => ({
			...plan,
			inventory: plan.inventory.map(inv => ({
				...inv,
				recipe: recipeMap.get(inv.recipeId)!
			}))
		}))

		return { plans, sessions, templates }
	})
})
