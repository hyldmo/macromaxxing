import { mealPlans, workoutExercises, workoutLogs, workoutSessions, workouts } from '@macromaxxing/db'
import { desc, eq } from 'drizzle-orm'
import { protectedProcedure, router } from '../trpc'

export const dashboardRouter = router({
	summary: protectedProcedure.query(async ({ ctx }) => {
		const [plans, sessions, templates] = await Promise.all([
			// All meal plans with full inventory/slot/recipe data for macro calculations
			ctx.db.query.mealPlans.findMany({
				where: eq(mealPlans.userId, ctx.user.id),
				with: {
					inventory: {
						with: {
							recipe: {
								with: {
									recipeIngredients: {
										with: {
											ingredient: true,
											subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
										},
										orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
									}
								}
							},
							slots: true
						}
					}
				},
				orderBy: (mealPlans, { desc }) => [desc(mealPlans.updatedAt)]
			}),

			// Recent workout sessions
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

			// Workout templates
			ctx.db.query.workouts.findMany({
				where: eq(workouts.userId, ctx.user.id),
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutExercises.sortOrder]
					}
				},
				orderBy: [workouts.sortOrder]
			})
		])

		return { plans, sessions, templates }
	})
})
