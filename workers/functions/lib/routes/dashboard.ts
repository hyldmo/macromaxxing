import {
	mealPlanInventory,
	mealPlans,
	resolveMacroTargets,
	summarizeSessionLogs,
	type TypeIDString,
	userSettings,
	workoutProgramItems
} from '@macromaxxing/db'
import { eq, inArray } from 'drizzle-orm'
import { toInventoryItem } from '../inventory'
import { trainingHardSetsPerWeek, trainingSessionsPerWeek } from '../training-frequency'
import { protectedProcedure, router } from '../trpc'
import { withImplementCount } from '../workout-response'

export const dashboardRouter = router({
	summary: protectedProcedure
		.meta({ description: "Get today's meals, recent workout sessions, and macro progress" })
		.query(async ({ ctx }) => {
			const [
				sessions,
				templates,
				plansShallow,
				planRecipes,
				planIngredients,
				settings,
				sessionsPerWeek,
				hardSetsPerWeek,
				skips
			] = await Promise.all([
				// Recent workout sessions (3 levels — acceptable)
				ctx.db.query.workoutSessions.findMany({
					where: { userId: ctx.user.id },
					with: {
						workout: true,
						location: true,
						logs: {
							with: { exercise: { with: { muscles: true, equipment: true } } },
							orderBy: { createdAt: 'asc' }
						}
					},
					orderBy: { startedAt: 'desc' },
					limit: 30
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
				// Q3: Bare ingredients referenced by that same inventory (no dependency on Q1)
				ctx.db.query.ingredients.findMany({
					where: {
						RAW: t =>
							inArray(
								t.id,
								ctx.db
									.select({ id: mealPlanInventory.ingredientId })
									.from(mealPlanInventory)
									.innerJoin(mealPlans, eq(mealPlanInventory.mealPlanId, mealPlans.id))
									.where(eq(mealPlans.userId, ctx.user.id))
							)
					},
					with: { units: true }
				}),

				ctx.db.query.userSettings.findFirst({
					where: { userId: ctx.user.id },
					with: {
						activeProgram: {
							with: { items: { orderBy: { sortOrder: 'asc' } } }
						}
					}
				}),

				// Q6: Training frequency — what an `auto` activity level resolves against.
				trainingSessionsPerWeek(ctx.db, ctx.user.id),

				// Q6b: Hard sets over the same window — what the carbohydrate floor scales on.
				// Separate from Q6 on purpose: sessions measure activity, hard sets measure
				// glycogen spend, and one session can be 5 sets or 15.
				trainingHardSetsPerWeek(ctx.db, ctx.user.id),

				// Q7: Recent skips, scoped to the active program in SQL. Only skips of program
				// members can anchor the cycle, so an unscoped `limit` would let skips of
				// off-program workouts (MCP can skip any owned one) push the anchor out of the
				// payload. No active program → the subquery yields null and this returns none,
				// which matches pickNextWorkout ignoring skips in legacy mode.
				ctx.db.query.workoutSkips.findMany({
					where: {
						userId: ctx.user.id,
						RAW: t =>
							inArray(
								t.workoutId,
								ctx.db
									.select({ id: workoutProgramItems.workoutId })
									.from(workoutProgramItems)
									.where(
										inArray(
											workoutProgramItems.programId,
											ctx.db
												.select({ id: userSettings.activeProgramId })
												.from(userSettings)
												.where(eq(userSettings.userId, ctx.user.id))
										)
									)
							)
					},
					columns: { id: true, workoutId: true, skippedAt: true },
					orderBy: { skippedAt: 'desc' },
					limit: 10
				})
			])

			// Assemble plans with whatever each inventory row points at
			const recipeMap = new Map(planRecipes.map(r => [r.id, r]))
			const ingredientMap = new Map(planIngredients.map(i => [i.id, i]))
			const plans = plansShallow.map(plan => ({
				...plan,
				inventory: plan.inventory.map(inv => toInventoryItem(inv, recipeMap, ingredientMap))
			}))

			const activeProgram: { id: TypeIDString<'wpr'>; name: string; workoutIds: TypeIDString<'wkt'>[] } | null =
				settings?.activeProgram
					? {
							id: settings.activeProgram.id,
							name: settings.activeProgram.name,
							workoutIds: settings.activeProgram.items.map(i => i.workoutId)
						}
					: null

			return {
				plans,
				// Same per-exercise rollup workout.listSessions ships, so SessionCard renders from
				// either query without re-deriving totals from the raw set rows.
				sessions: sessions.map(s => ({ ...s, summary: summarizeSessionLogs(withImplementCount(s.logs)) })),
				templates,
				activeProgram,
				// Skips anchor the program cycle alongside completed sessions — see pickNextWorkout.
				skips,
				// Derived from the same settings row the active program comes from, so the week
				// calendar can price day totals against the user's goal without a second query.
				macroTargets: settings
					? resolveMacroTargets({
							...settings,
							trainingSessionsPerWeek: sessionsPerWeek,
							trainingHardSetsPerWeek: hardSetsPerWeek
						})
					: null
			}
		})
})
