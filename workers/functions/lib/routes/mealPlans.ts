import {
	getAllUnits,
	mealPlanInventory,
	mealPlanSlots,
	mealPlans,
	recipeIngredients,
	recipes,
	resolveUnitGrams,
	type TypeIDString,
	zodTypeID,
	zWeekStart
} from '@macromaxxing/db'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router, type TRPCContext } from '../trpc'

/**
 * `slotIndex` is a position within a day, so two rows must never share one: the planner renders a
 * day as an ordered list of positions and a collision hides every row but one, while the inventory
 * and weekly totals keep counting them all. Callers pass the index of the slot they *saw* as empty,
 * which goes stale as soon as another allocation lands there (e.g. two adds from one open modal),
 * so the server resolves the collision by appending after the day's last used index.
 */
async function resolveSlotIndex(
	db: TRPCContext['db'],
	planId: TypeIDString<'mpl'>,
	dayOfWeek: number,
	requested: number
): Promise<number> {
	const daySlots = await db
		.select({ slotIndex: mealPlanSlots.slotIndex })
		.from(mealPlanSlots)
		.innerJoin(mealPlanInventory, eq(mealPlanSlots.inventoryId, mealPlanInventory.id))
		.where(and(eq(mealPlanInventory.mealPlanId, planId), eq(mealPlanSlots.dayOfWeek, dayOfWeek)))

	const taken = daySlots.map(s => s.slotIndex)
	if (!taken.includes(requested)) return requested
	return Math.max(...taken) + 1
}

/** One portion of an `ingredient`-type wrapper recipe, so a slot's portions read as hectograms. */
const PORTION_GRAMS = 100

/**
 * Inventory takes a recipe id straight from the client, and `mealPlan.get` hands back each one as a
 * full recipe with its ingredients. Without this, adding someone else's private recipe to your own
 * plan reads it back in full — routing around the identical check `recipe.get` makes.
 */
async function assertRecipeVisible(db: TRPCContext['db'], recipeId: TypeIDString<'rcp'>, userId: string) {
	const recipe = await db.query.recipes.findFirst({
		where: { id: recipeId },
		columns: { userId: true, isPublic: true }
	})
	if (!(recipe && (recipe.isPublic || recipe.userId === userId))) throw new Error('Recipe not found')
}

/**
 * Find (or create) the wrapper recipe that lets a bare library ingredient sit in a meal plan.
 *
 * Inventory references recipes, not ingredients, so "200 g chicken breast" needs a recipe to hang
 * off. Wrapping keeps every downstream consumer — macros, grocery list, week calendar, export —
 * working on one shape instead of a nullable recipe/ingredient union. The wrapper holds 100 g so
 * 1 portion = 100 g and the slot's (fractional) portions carry the amount, and it is reused across
 * plans so logging chicken twice doesn't spawn a second recipe.
 */
async function findOrCreateIngredientRecipe(
	db: TRPCContext['db'],
	userId: string,
	ingredientId: TypeIDString<'ing'>
): Promise<TypeIDString<'rcp'>> {
	const [existing] = await db
		.select({ id: recipes.id })
		.from(recipes)
		.innerJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
		.where(
			and(
				eq(recipes.userId, userId),
				eq(recipes.type, 'ingredient'),
				eq(recipeIngredients.ingredientId, ingredientId)
			)
		)
		.limit(1)
	if (existing) return existing.id

	const ingredient = await db.query.ingredients.findFirst({ where: { id: ingredientId } })
	if (!ingredient) throw new Error('Ingredient not found')

	const now = Date.now()
	const [recipe] = await db
		.insert(recipes)
		.values({
			userId,
			name: ingredient.name,
			type: 'ingredient',
			portionSize: PORTION_GRAMS,
			isPublic: false,
			createdAt: now,
			updatedAt: now
		})
		.returning()

	await db.insert(recipeIngredients).values({
		recipeId: recipe.id,
		ingredientId,
		amountGrams: PORTION_GRAMS,
		sortOrder: 0
	})

	return recipe.id
}

/**
 * How much of an ingredient a log entry means, in grams.
 *
 * `grams` is the literal path. `amount` + `unit` resolves against the ingredient's own unit table
 * (plus the volume units its density implies), so "half an avocado" is priced from the stored
 * edible weight rather than each client inventing its own conversion — and a unit the ingredient
 * doesn't have is an error, never a silent fallback to 1 g.
 */
async function resolveIngredientGrams(
	db: TRPCContext['db'],
	entry: { ingredientId: TypeIDString<'ing'>; grams?: number; amount?: number; unit?: string }
): Promise<number> {
	if (entry.grams != null) return entry.grams
	if (entry.amount == null) throw new Error('Ingredient entry needs either grams, or amount + unit')

	const ingredient = await db.query.ingredients.findFirst({
		where: { id: entry.ingredientId },
		with: { units: true }
	})
	if (!ingredient) throw new Error('Ingredient not found')

	const unitName = entry.unit ?? 'g'
	const gramsPerUnit = resolveUnitGrams(unitName, ingredient.units, ingredient.density)
	if (gramsPerUnit == null) {
		const known = new Set(['g', ...getAllUnits(ingredient.units, ingredient.density).map(u => u.name)])
		throw new Error(`${ingredient.name} has no unit "${unitName}". Known units: ${[...known].join(', ')}`)
	}

	return entry.amount * gramsPerUnit
}

export const mealPlansRouter = router({
	list: protectedProcedure.meta({ description: 'List meal plans' }).query(async ({ ctx }) => {
		const result = await ctx.db.query.mealPlans.findMany({
			where: { userId: ctx.user.id },
			with: { inventory: true },
			orderBy: { updatedAt: 'desc' }
		})
		return result
	}),

	get: protectedProcedure
		.meta({ description: 'Get meal plan with inventory and weekly slot allocations' })
		.input(z.object({ id: zodTypeID('mpl') }))
		.query(async ({ ctx, input }) => {
			const [plan, allRecipes] = await ctx.db.batch([
				// Q1: Plan + inventory + slots (2 levels, shallow)
				ctx.db.query.mealPlans.findFirst({
					where: { id: input.id, userId: ctx.user.id },
					with: { inventory: { with: { slots: true } } }
				}),
				// Q2: Recipes via subquery on inventory (3 levels, no dependency on Q1)
				ctx.db.query.recipes.findMany({
					where: {
						RAW: t =>
							inArray(
								t.id,
								ctx.db
									.select({ id: mealPlanInventory.recipeId })
									.from(mealPlanInventory)
									.where(eq(mealPlanInventory.mealPlanId, input.id))
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
				})
			] as const)
			if (!plan) throw new Error('Meal plan not found')

			const recipeMap = new Map(allRecipes.map(r => [r.id, r]))
			return {
				...plan,
				inventory: plan.inventory.map(inv => ({
					...inv,
					recipe: recipeMap.get(inv.recipeId)!
				}))
			}
		}),

	create: protectedProcedure
		.meta({
			description:
				'Create a meal plan. `weekStart` is the Monday (YYYY-MM-DD) whose Mon–Sun grid the plan describes — a past week reads as a log, a future one as a plan. Omit it for a reusable template with no week of its own.'
		})
		.input(z.object({ name: z.string().min(1), weekStart: zWeekStart.nullish() }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const [plan] = await ctx.db
				.insert(mealPlans)
				.values({
					userId: ctx.user.id,
					name: input.name,
					weekStart: input.weekStart ?? null,
					createdAt: now,
					updatedAt: now
				})
				.returning()
			return plan
		}),

	update: protectedProcedure
		.meta({ description: 'Rename a meal plan, or move it to another week (null = turn it into a template)' })
		.input(
			z.object({
				id: zodTypeID('mpl'),
				name: z.string().min(1).optional(),
				weekStart: zWeekStart.nullable().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updates } = input
			await ctx.db
				.update(mealPlans)
				.set({ ...updates, updatedAt: Date.now() })
				.where(and(eq(mealPlans.id, id), eq(mealPlans.userId, ctx.user.id)))
			return ctx.db.query.mealPlans.findFirst({
				where: { id, userId: ctx.user.id }
			})
		}),

	delete: protectedProcedure
		.meta({ description: 'Delete a meal plan' })
		.input(z.object({ id: zodTypeID('mpl') }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(mealPlans).where(and(eq(mealPlans.id, input.id), eq(mealPlans.userId, ctx.user.id)))
		}),

	duplicate: protectedProcedure
		.meta({
			description:
				'Copy a plan (inventory + slots) under a new name. Pass `weekStart` to drop a template onto a concrete week, or to carry last week forward.'
		})
		.input(
			z.object({
				id: zodTypeID('mpl'),
				newName: z.string().min(1),
				weekStart: zWeekStart.nullish()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get source plan with all data
			const source = await ctx.db.query.mealPlans.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				with: {
					inventory: {
						with: { slots: true }
					}
				}
			})
			if (!source) throw new Error('Meal plan not found')

			const now = Date.now()

			// Create new plan
			const [newPlan] = await ctx.db
				.insert(mealPlans)
				.values({
					userId: ctx.user.id,
					name: input.newName,
					weekStart: input.weekStart ?? null,
					createdAt: now,
					updatedAt: now
				})
				.returning()

			// Map old inventory IDs to new inventory IDs
			const inventoryIdMap = new Map<string, TypeIDString<'mpi'>>()

			// Copy inventory items
			for (const inv of source.inventory) {
				const [newInv] = await ctx.db
					.insert(mealPlanInventory)
					.values({
						mealPlanId: newPlan.id,
						recipeId: inv.recipeId,
						totalPortions: inv.totalPortions,
						createdAt: now
					})
					.returning()
				inventoryIdMap.set(inv.id, newInv.id)

				// Copy slots for this inventory item
				for (const slot of inv.slots) {
					await ctx.db.insert(mealPlanSlots).values({
						inventoryId: newInv.id,
						dayOfWeek: slot.dayOfWeek,
						slotIndex: slot.slotIndex,
						portions: slot.portions,
						createdAt: now
					})
				}
			}

			return newPlan
		}),

	// Inventory operations
	addToInventory: protectedProcedure
		.meta({ description: 'Add a recipe to meal plan inventory with portion count' })
		.input(
			z.object({
				planId: zodTypeID('mpl'),
				recipeId: zodTypeID('rcp'),
				totalPortions: z.number().positive()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify plan ownership
			const plan = await ctx.db.query.mealPlans.findFirst({
				where: { id: input.planId, userId: ctx.user.id }
			})
			if (!plan) throw new Error('Meal plan not found')
			await assertRecipeVisible(ctx.db, input.recipeId, ctx.user.id)

			const now = Date.now()
			const [inv] = await ctx.db
				.insert(mealPlanInventory)
				.values({
					mealPlanId: input.planId,
					recipeId: input.recipeId,
					totalPortions: input.totalPortions,
					createdAt: now
				})
				.returning()

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: now }).where(eq(mealPlans.id, input.planId))

			return ctx.db.query.mealPlanInventory.findFirst({
				where: { id: inv.id },
				with: {
					recipe: {
						with: {
							recipeIngredients: {
								with: {
									ingredient: true,
									subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
								}
							}
						}
					},
					slots: true
				}
			})
		}),

	updateInventory: protectedProcedure
		.input(
			z.object({
				inventoryId: zodTypeID('mpi'),
				totalPortions: z.number().positive()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get inventory item and verify ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: { id: input.inventoryId },
				with: { mealPlan: true }
			})
			if (!inv || inv.mealPlan.userId !== ctx.user.id) {
				throw new Error('Inventory item not found')
			}

			await ctx.db
				.update(mealPlanInventory)
				.set({ totalPortions: input.totalPortions })
				.where(eq(mealPlanInventory.id, input.inventoryId))

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: Date.now() }).where(eq(mealPlans.id, inv.mealPlanId))

			return ctx.db.query.mealPlanInventory.findFirst({
				where: { id: input.inventoryId },
				with: {
					recipe: {
						with: {
							recipeIngredients: {
								with: {
									ingredient: true,
									subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
								}
							}
						}
					},
					slots: true
				}
			})
		}),

	removeFromInventory: protectedProcedure
		.meta({ description: 'Remove a recipe from meal plan inventory' })
		.input(z.object({ inventoryId: zodTypeID('mpi') }))
		.mutation(async ({ ctx, input }) => {
			// Get inventory item and verify ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: { id: input.inventoryId },
				with: { mealPlan: true }
			})
			if (!inv || inv.mealPlan.userId !== ctx.user.id) {
				throw new Error('Inventory item not found')
			}

			await ctx.db.delete(mealPlanInventory).where(eq(mealPlanInventory.id, input.inventoryId))

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: Date.now() }).where(eq(mealPlans.id, inv.mealPlanId))
		}),

	ensureWeek: protectedProcedure
		.meta({
			description:
				"Get the plan covering a week (Monday, YYYY-MM-DD), creating an empty one if there isn't one yet. Idempotent — call it before logging when you don't already hold a planId. If several plans share the week, returns the most recently touched."
		})
		.input(z.object({ weekStart: zWeekStart, name: z.string().min(1).optional() }))
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.mealPlans.findFirst({
				where: { userId: ctx.user.id, weekStart: input.weekStart },
				orderBy: { updatedAt: 'desc' }
			})
			if (existing) return existing

			const now = Date.now()
			const [plan] = await ctx.db
				.insert(mealPlans)
				.values({
					userId: ctx.user.id,
					name: input.name ?? `Week of ${input.weekStart}`,
					weekStart: input.weekStart,
					createdAt: now,
					updatedAt: now
				})
				.returning()
			return plan
		}),

	logMeal: protectedProcedure
		.meta({
			description:
				"Put a meal on a day in one call: resolves (or creates) the inventory row, then allocates the slot. This is the logging verb — use it to record what was eaten. Use addToInventory + allocate instead when planning a cook-up, where the portion pool is declared up front and over-allocating it should warn. `entry.kind: 'ingredient'` logs a bare library ingredient, no recipe needed — either by `grams`, or by `amount` + `unit` (e.g. 0.5 pcs) resolved against the ingredient's own units, which is the accurate way to log something you measured in pieces rather than on a scale."
		})
		.input(
			z.object({
				planId: zodTypeID('mpl'),
				dayOfWeek: z.number().int().min(0).max(6),
				slotIndex: z.number().int().min(0).default(0),
				entry: z.discriminatedUnion('kind', [
					z.object({
						kind: z.literal('recipe'),
						recipeId: zodTypeID('rcp'),
						portions: z.number().positive().default(1)
					}),
					z.object({
						kind: z.literal('ingredient'),
						ingredientId: zodTypeID('ing'),
						grams: z
							.number()
							.positive()
							.optional()
							.describe('Weight in grams. Omit when passing amount + unit.'),
						amount: z
							.number()
							.positive()
							.optional()
							.describe(
								'Amount in `unit`s, e.g. 0.5 with unit "pcs". Requires unit; ignored if grams is set.'
							),
						unit: z
							.string()
							.optional()
							.describe(
								'Unit name from this ingredient\'s own table (ingredient.listUnits), e.g. "pcs", "medium", "tbsp", "scoop". Gram values are edible weight on the same basis as the per-100g macros, so 0.5 pcs avocado is half the flesh — no need to convert client-side. Unknown units error rather than guess.'
							)
					})
				])
			})
		)
		.mutation(async ({ ctx, input }) => {
			const plan = await ctx.db.query.mealPlans.findFirst({
				where: { id: input.planId, userId: ctx.user.id }
			})
			if (!plan) throw new Error('Meal plan not found')

			if (input.entry.kind === 'recipe') await assertRecipeVisible(ctx.db, input.entry.recipeId, ctx.user.id)

			const { recipeId, portions } =
				input.entry.kind === 'recipe'
					? { recipeId: input.entry.recipeId, portions: input.entry.portions }
					: {
							// Amount first: an unknown unit must fail before findOrCreate leaves a wrapper recipe behind.
							portions: (await resolveIngredientGrams(ctx.db, input.entry)) / PORTION_GRAMS,
							recipeId: await findOrCreateIngredientRecipe(ctx.db, ctx.user.id, input.entry.ingredientId)
						}

			const now = Date.now()
			const existing = await ctx.db.query.mealPlanInventory.findFirst({
				where: { mealPlanId: input.planId, recipeId },
				with: { slots: true }
			})

			// `allocate` leaves the pool alone, so spreading a cook-up too thin still warns. Logging runs
			// the other way — the portions are already eaten — so the pool grows to cover them and the
			// over-allocation warning stays quiet on a plan that's being used as a diary.
			let inventoryId: TypeIDString<'mpi'>
			if (existing) {
				inventoryId = existing.id
				const allocated = existing.slots.reduce((sum, s) => sum + s.portions, 0) + portions
				if (allocated > existing.totalPortions) {
					await ctx.db
						.update(mealPlanInventory)
						.set({ totalPortions: allocated })
						.where(eq(mealPlanInventory.id, existing.id))
				}
			} else {
				const [inv] = await ctx.db
					.insert(mealPlanInventory)
					.values({ mealPlanId: input.planId, recipeId, totalPortions: portions, createdAt: now })
					.returning()
				inventoryId = inv.id
			}

			const slotIndex = await resolveSlotIndex(ctx.db, input.planId, input.dayOfWeek, input.slotIndex)
			const [slot] = await ctx.db
				.insert(mealPlanSlots)
				.values({ inventoryId, dayOfWeek: input.dayOfWeek, slotIndex, portions, createdAt: now })
				.returning()

			await ctx.db.update(mealPlans).set({ updatedAt: now }).where(eq(mealPlans.id, input.planId))

			return slot
		}),

	// Slot operations
	allocate: protectedProcedure
		.meta({ description: 'Allocate portions to a day and slot in the meal plan' })
		.input(
			z.object({
				inventoryId: zodTypeID('mpi'),
				dayOfWeek: z.number().int().min(0).max(6),
				slotIndex: z.number().int().min(0),
				portions: z.number().positive().default(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify inventory ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: { id: input.inventoryId },
				with: { mealPlan: true }
			})
			if (!inv || inv.mealPlan.userId !== ctx.user.id) {
				throw new Error('Inventory item not found')
			}

			const now = Date.now()
			const slotIndex = await resolveSlotIndex(ctx.db, inv.mealPlanId, input.dayOfWeek, input.slotIndex)
			const [slot] = await ctx.db
				.insert(mealPlanSlots)
				.values({
					inventoryId: input.inventoryId,
					dayOfWeek: input.dayOfWeek,
					slotIndex,
					portions: input.portions,
					createdAt: now
				})
				.returning()

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: now }).where(eq(mealPlans.id, inv.mealPlanId))

			return slot
		}),

	updateSlot: protectedProcedure
		.input(
			z.object({
				slotId: zodTypeID('mps'),
				portions: z.number().positive().optional(),
				inventoryId: zodTypeID('mpi').optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: { id: input.slotId },
				with: {
					inventory: {
						with: { mealPlan: true }
					}
				}
			})
			if (!slot || slot.inventory.mealPlan.userId !== ctx.user.id) {
				throw new Error('Slot not found')
			}

			const updates: Partial<typeof mealPlanSlots.$inferInsert> = {}
			if (input.portions !== undefined) updates.portions = input.portions
			if (input.inventoryId !== undefined) {
				// Slots load through their inventory row rather than their plan, so an unchecked
				// destination lets you re-parent your own slot onto another user's inventory — which
				// makes the meal appear in THEIR plan. Confining the move to this plan covers both.
				const target = await ctx.db.query.mealPlanInventory.findFirst({
					where: { id: input.inventoryId },
					columns: { mealPlanId: true }
				})
				if (!target || target.mealPlanId !== slot.inventory.mealPlanId) {
					throw new Error('Inventory item not found')
				}
				updates.inventoryId = input.inventoryId
			}

			if (Object.keys(updates).length > 0) {
				await ctx.db.update(mealPlanSlots).set(updates).where(eq(mealPlanSlots.id, input.slotId))
			}

			// Touch plan updatedAt
			await ctx.db
				.update(mealPlans)
				.set({ updatedAt: Date.now() })
				.where(eq(mealPlans.id, slot.inventory.mealPlanId))

			return ctx.db.query.mealPlanSlots.findFirst({
				where: { id: input.slotId }
			})
		}),

	removeSlot: protectedProcedure
		.meta({ description: 'Remove a portion allocation from a meal plan slot' })
		.input(z.object({ slotId: zodTypeID('mps') }))
		.mutation(async ({ ctx, input }) => {
			// Get slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: { id: input.slotId },
				with: {
					inventory: {
						with: { mealPlan: true }
					}
				}
			})
			if (!slot || slot.inventory.mealPlan.userId !== ctx.user.id) {
				throw new Error('Slot not found')
			}

			await ctx.db.delete(mealPlanSlots).where(eq(mealPlanSlots.id, input.slotId))

			// Touch plan updatedAt
			await ctx.db
				.update(mealPlans)
				.set({ updatedAt: Date.now() })
				.where(eq(mealPlans.id, slot.inventory.mealPlanId))
		}),

	copySlot: protectedProcedure
		.input(
			z.object({
				slotId: zodTypeID('mps'),
				targetDays: z.array(z.number().int().min(0).max(6)),
				targetSlotIndex: z.number().int().min(0)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get source slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: { id: input.slotId },
				with: {
					inventory: {
						with: { mealPlan: true }
					}
				}
			})
			if (!slot || slot.inventory.mealPlan.userId !== ctx.user.id) {
				throw new Error('Slot not found')
			}

			const now = Date.now()
			const newSlots = []

			for (const day of input.targetDays) {
				const slotIndex = await resolveSlotIndex(ctx.db, slot.inventory.mealPlanId, day, input.targetSlotIndex)
				const [newSlot] = await ctx.db
					.insert(mealPlanSlots)
					.values({
						inventoryId: slot.inventoryId,
						dayOfWeek: day,
						slotIndex,
						portions: slot.portions,
						createdAt: now
					})
					.returning()
				newSlots.push(newSlot)
			}

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: now }).where(eq(mealPlans.id, slot.inventory.mealPlanId))

			return newSlots
		})
})
