import {
	getAllUnits,
	mealPlanInventory,
	mealPlanSlots,
	mealPlans,
	resolveUnitGrams,
	type TypeIDString,
	zodTypeID,
	zWeekStart
} from '@macromaxxing/db'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { INGREDIENT_PORTION_GRAMS, toInventoryItem } from '../inventory'
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

/**
 * Grams in one `unitName` of an inventory row's ingredient, or null when the row holds a recipe —
 * those are counted in portions and have no unit to step in.
 *
 * Editing a slot's amount reruns the conversion `logMeal` did, so a stepper tap sends `3 small` and
 * gets the grams the server would have computed for an agent sending the same pair.
 */
async function resolveInventoryUnitGrams(
	db: TRPCContext['db'],
	ingredientId: TypeIDString<'ing'> | null,
	unitName: string
): Promise<number | null> {
	if (!ingredientId) return null

	const ingredient = await db.query.ingredients.findFirst({
		where: { id: ingredientId },
		with: { units: true }
	})
	if (!ingredient) return null

	return resolveUnitGrams(unitName, ingredient.units, ingredient.density)
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
			const [plan, allRecipes, allIngredients] = await ctx.db.batch([
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
				}),
				// Q3: Bare ingredients the plan points at, same trick
				ctx.db.query.ingredients.findMany({
					where: {
						RAW: t =>
							inArray(
								t.id,
								ctx.db
									.select({ id: mealPlanInventory.ingredientId })
									.from(mealPlanInventory)
									.where(eq(mealPlanInventory.mealPlanId, input.id))
							)
					},
					with: { units: true }
				})
			] as const)
			if (!plan) throw new Error('Meal plan not found')

			const recipeMap = new Map(allRecipes.map(r => [r.id, r]))
			const ingredientMap = new Map(allIngredients.map(i => [i.id, i]))
			return {
				...plan,
				inventory: plan.inventory.map(inv => toInventoryItem(inv, recipeMap, ingredientMap))
			}
		}),

	create: protectedProcedure
		.meta({
			description:
				'Create a meal plan. `weekStart` is the Monday (YYYY-MM-DD) whose Mon–Sun grid the plan describes — a past week reads as a log, a future one as a plan. Omit it for a reusable template with no week of its own. `name` is optional: an unnamed plan is shown as its week number.'
		})
		.input(z.object({ name: z.string().min(1).nullish(), weekStart: zWeekStart.nullish() }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const [plan] = await ctx.db
				.insert(mealPlans)
				.values({
					userId: ctx.user.id,
					name: input.name ?? null,
					weekStart: input.weekStart ?? null,
					createdAt: now,
					updatedAt: now
				})
				.returning()
			return plan
		}),

	update: protectedProcedure
		.meta({
			description:
				'Rename a meal plan (name null = drop the name and fall back to its week number), or move it to another week (weekStart null = turn it into a template)'
		})
		.input(
			z.object({
				id: zodTypeID('mpl'),
				name: z.string().min(1).nullable().optional(),
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
				'Copy a plan (inventory + slots). Pass `weekStart` to drop a template onto a concrete week, or to carry last week forward; omit `newName` to leave the copy unnamed (it reads as its week number).'
		})
		.input(
			z.object({
				id: zodTypeID('mpl'),
				newName: z.string().min(1).nullish(),
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
					name: input.newName ?? null,
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
		.input(z.object({ weekStart: zWeekStart, name: z.string().min(1).nullish() }))
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
					name: input.name ?? null,
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

			// A bare ingredient is counted in 100 g portions, so the slot's (fractional) portions carry
			// the amount. Nothing is created for it: the inventory row points straight at the row in
			// the ingredient library.
			const target =
				input.entry.kind === 'recipe'
					? { recipeId: input.entry.recipeId, ingredientId: null, portions: input.entry.portions }
					: {
							recipeId: null,
							ingredientId: input.entry.ingredientId,
							portions: (await resolveIngredientGrams(ctx.db, input.entry)) / INGREDIENT_PORTION_GRAMS
						}
			const { portions } = target

			// Remember what was typed. A wrapper holds 100 g, so "2 small eggs" resolves to 0.76
			// portions and the card has nothing to render but that number unless the pair is kept.
			// `grams` callers already measured in the unit they'd read back, so they store nothing.
			const display =
				input.entry.kind === 'ingredient' && input.entry.grams == null && input.entry.amount != null
					? { displayAmount: input.entry.amount, displayUnit: input.entry.unit ?? 'g' }
					: {}

			const now = Date.now()
			const existing = await ctx.db.query.mealPlanInventory.findFirst({
				where: {
					mealPlanId: input.planId,
					...(target.recipeId ? { recipeId: target.recipeId } : { ingredientId: target.ingredientId })
				},
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
					.values({
						mealPlanId: input.planId,
						recipeId: target.recipeId,
						ingredientId: target.ingredientId,
						totalPortions: portions,
						createdAt: now
					})
					.returning()
				inventoryId = inv.id
			}

			const slotIndex = await resolveSlotIndex(ctx.db, input.planId, input.dayOfWeek, input.slotIndex)
			const [slot] = await ctx.db
				.insert(mealPlanSlots)
				.values({ inventoryId, dayOfWeek: input.dayOfWeek, slotIndex, portions, ...display, createdAt: now })
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
		.meta({
			description:
				'Change how much of a meal sits in a slot, or move the slot onto a different inventory row. A slot holding a bare ingredient counts in that ingredient\'s own units, so send `displayAmount` (2 -> "2 small") and the server reprices the portions; a slot holding a recipe counts in portions, so send `portions` and `displayAmount` errors. Correcting an amount is the only edit here — to change WHAT was eaten, pass `inventoryId`, which drops the old amount\'s unit.'
		})
		.input(
			z.object({
				slotId: zodTypeID('mps'),
				portions: z.number().positive().optional(),
				/**
				 * New amount in the slot's own `displayUnit` (2 -> "2 small"). Takes precedence over
				 * `portions`, which it recomputes. Sent by the card's stepper so one tap means one egg.
				 */
				displayAmount: z.number().positive().optional(),
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

			// The two numbers are one fact, so whichever side moves, the other is recomputed through
			// the ingredient's own unit table. Letting them drift is what lets a card claim "2 small"
			// over macros priced for three. Slots logged by weight carry no unit yet, so they resolve
			// as grams and the first edit pins that down.
			const unitName = slot.displayUnit ?? 'g'
			// A query, so a plain swap (the common case from the popover) doesn't pay for it.
			const gramsPerUnit =
				input.displayAmount === undefined && input.portions === undefined
					? null
					: await resolveInventoryUnitGrams(ctx.db, slot.inventory.ingredientId, unitName)
			if (input.displayAmount !== undefined) {
				if (gramsPerUnit == null) throw new Error('Slot holds a recipe, so it counts in portions')
				updates.displayAmount = input.displayAmount
				updates.displayUnit = unitName
				updates.portions = (input.displayAmount * gramsPerUnit) / INGREDIENT_PORTION_GRAMS
			} else if (input.portions !== undefined) {
				updates.portions = input.portions
				if (slot.displayUnit && gramsPerUnit) {
					updates.displayAmount = (input.portions * INGREDIENT_PORTION_GRAMS) / gramsPerUnit
				}
			}

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
				// A swap re-points the slot at a different recipe, and the amount was counted in the
				// old ingredient's unit. Drop it rather than let "2 small" ride along onto chicken.
				updates.displayAmount = null
				updates.displayUnit = null
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
						displayAmount: slot.displayAmount,
						displayUnit: slot.displayUnit,
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
