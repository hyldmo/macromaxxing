import { mealPlanInventory, mealPlans, type TypeIDString } from '@macromaxxing/db'
import { eq, inArray } from 'drizzle-orm'
import { protectedProcedure, router } from '../trpc'

export const dashboardRouter = router({
	summary: protectedProcedure
		.meta({ description: "Get today's meals, recent workout sessions, and macro progress" })
		.query(async ({ ctx }) => {
			const [sessions, templates, plansShallow, planRecipes, settings] = await Promise.all([
				// Recent workout sessions (3 levels — acceptable)
				ctx.db.query.workoutSessions.findMany({
					where: { userId: ctx.user.id },
					with: {
						workout: true,
						location: true,
						logs: {
							with: { exercise: { with: { muscles: true } } },
							orderBy: { createdAt: 'asc' }
						}
					},
					orderBy: { startedAt: 'desc' },
					limit: 5
				}),

				// Workout templates (3 levels — acceptable). Shape must stay identical to
				// workout.listWorkouts — ProgramCard consumes templates from either query.
				ctx.db.query.workouts.findMany({
					where: { userId: ctx.user.id },
					with: {
						exercises: {
							with: { exercise: { with: { muscles: true, equipment: true } } },
							orderBy: { sortOrder: 'asc' }
						},
						location: { with: { equipment: true } }
					},
					orderBy: { sortOrder: 'asc' }
				}),

				// Q1: Plans + inventory + slots (2 levels, shallow)
				ctx.db.query.mealPlans.findMany({
					where: { userId: ctx.user.id },
					with: { inventory: { with: { slots: true } } },
					orderBy: { updatedAt: 'desc' }
				}),

				// Q2: All recipes referenced by user's plan inventory (3 levels, no dependency on Q1)
				ctx.db.query.recipes.findMany({
					where: {
						RAW: t =>
							inArray(
								t.id,
								ctx.db
									.select({ id: mealPlanInventory.recipeId })
									.from(mealPlanInventory)
									.innerJoin(mealPlans, eq(mealPlanInventory.mealPlanId, mealPlans.id))
									.where(eq(mealPlans.userId, ctx.user.id))
							)
					},
					with: {
						recipeIngredients: {
							with: {
								ingredient: true,
								subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
							},
							orderBy: { sortOrder: 'asc' }
						}
					}
				}),

				// Q5: Active program (with ordered items) for dashboard cycling
				ctx.db.query.userSettings.findFirst({
					where: { userId: ctx.user.id },
					with: {
						activeProgram: {
							with: { items: { orderBy: { sortOrder: 'asc' } } }
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

			const activeProgram: { id: TypeIDString<'wpr'>; name: string; workoutIds: TypeIDString<'wkt'>[] } | null =
				settings?.activeProgram
					? {
							id: settings.activeProgram.id,
							name: settings.activeProgram.name,
							workoutIds: settings.activeProgram.items.map(i => i.workoutId)
						}
					: null

			return { plans, sessions, templates, activeProgram }
		})
})
