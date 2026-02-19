import { mealPlanInventory, mealPlanSlots, mealPlans, recipes, type TypeIDString } from '@macromaxxing/db'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

export const mealPlansRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const result = await ctx.db.query.mealPlans.findMany({
			where: eq(mealPlans.userId, ctx.user.id),
			with: { inventory: true },
			orderBy: (mealPlans, { desc }) => [desc(mealPlans.updatedAt)]
		})
		return result
	}),

	get: protectedProcedure.input(z.object({ id: z.custom<TypeIDString<'mpl'>>() })).query(async ({ ctx, input }) => {
		const [plan, allRecipes] = await ctx.db.batch([
			// Q1: Plan + inventory + slots (2 levels, shallow)
			ctx.db.query.mealPlans.findFirst({
				where: and(eq(mealPlans.id, input.id), eq(mealPlans.userId, ctx.user.id)),
				with: { inventory: { with: { slots: true } } }
			}),
			// Q2: Recipes via subquery on inventory (3 levels, no dependency on Q1)
			ctx.db.query.recipes.findMany({
				where: inArray(
					recipes.id,
					ctx.db
						.select({ id: mealPlanInventory.recipeId })
						.from(mealPlanInventory)
						.where(eq(mealPlanInventory.mealPlanId, input.id))
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

	create: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
		const now = Date.now()
		const [plan] = await ctx.db
			.insert(mealPlans)
			.values({
				userId: ctx.user.id,
				name: input.name,
				createdAt: now,
				updatedAt: now
			})
			.returning()
		return plan
	}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.custom<TypeIDString<'mpl'>>(),
				name: z.string().min(1).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updates } = input
			await ctx.db
				.update(mealPlans)
				.set({ ...updates, updatedAt: Date.now() })
				.where(and(eq(mealPlans.id, id), eq(mealPlans.userId, ctx.user.id)))
			return ctx.db.query.mealPlans.findFirst({
				where: eq(mealPlans.id, id)
			})
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'mpl'>>() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(mealPlans).where(and(eq(mealPlans.id, input.id), eq(mealPlans.userId, ctx.user.id)))
		}),

	duplicate: protectedProcedure
		.input(
			z.object({
				id: z.custom<TypeIDString<'mpl'>>(),
				newName: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get source plan with all data
			const source = await ctx.db.query.mealPlans.findFirst({
				where: and(eq(mealPlans.id, input.id), eq(mealPlans.userId, ctx.user.id)),
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
		.input(
			z.object({
				planId: z.custom<TypeIDString<'mpl'>>(),
				recipeId: z.custom<TypeIDString<'rcp'>>(),
				totalPortions: z.number().positive()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify plan ownership
			const plan = await ctx.db.query.mealPlans.findFirst({
				where: and(eq(mealPlans.id, input.planId), eq(mealPlans.userId, ctx.user.id))
			})
			if (!plan) throw new Error('Meal plan not found')

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
				where: eq(mealPlanInventory.id, inv.id),
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
				inventoryId: z.custom<TypeIDString<'mpi'>>(),
				totalPortions: z.number().positive()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get inventory item and verify ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: eq(mealPlanInventory.id, input.inventoryId),
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
				where: eq(mealPlanInventory.id, input.inventoryId),
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
		.input(z.object({ inventoryId: z.custom<TypeIDString<'mpi'>>() }))
		.mutation(async ({ ctx, input }) => {
			// Get inventory item and verify ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: eq(mealPlanInventory.id, input.inventoryId),
				with: { mealPlan: true }
			})
			if (!inv || inv.mealPlan.userId !== ctx.user.id) {
				throw new Error('Inventory item not found')
			}

			await ctx.db.delete(mealPlanInventory).where(eq(mealPlanInventory.id, input.inventoryId))

			// Touch plan updatedAt
			await ctx.db.update(mealPlans).set({ updatedAt: Date.now() }).where(eq(mealPlans.id, inv.mealPlanId))
		}),

	// Slot operations
	allocate: protectedProcedure
		.input(
			z.object({
				inventoryId: z.custom<TypeIDString<'mpi'>>(),
				dayOfWeek: z.number().int().min(0).max(6),
				slotIndex: z.number().int().min(0),
				portions: z.number().positive().default(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify inventory ownership
			const inv = await ctx.db.query.mealPlanInventory.findFirst({
				where: eq(mealPlanInventory.id, input.inventoryId),
				with: { mealPlan: true }
			})
			if (!inv || inv.mealPlan.userId !== ctx.user.id) {
				throw new Error('Inventory item not found')
			}

			const now = Date.now()
			const [slot] = await ctx.db
				.insert(mealPlanSlots)
				.values({
					inventoryId: input.inventoryId,
					dayOfWeek: input.dayOfWeek,
					slotIndex: input.slotIndex,
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
				slotId: z.custom<TypeIDString<'mps'>>(),
				portions: z.number().positive().optional(),
				inventoryId: z.custom<TypeIDString<'mpi'>>().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: eq(mealPlanSlots.id, input.slotId),
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
			if (input.inventoryId !== undefined) updates.inventoryId = input.inventoryId

			if (Object.keys(updates).length > 0) {
				await ctx.db.update(mealPlanSlots).set(updates).where(eq(mealPlanSlots.id, input.slotId))
			}

			// Touch plan updatedAt
			await ctx.db
				.update(mealPlans)
				.set({ updatedAt: Date.now() })
				.where(eq(mealPlans.id, slot.inventory.mealPlanId))

			return ctx.db.query.mealPlanSlots.findFirst({
				where: eq(mealPlanSlots.id, input.slotId)
			})
		}),

	removeSlot: protectedProcedure
		.input(z.object({ slotId: z.custom<TypeIDString<'mps'>>() }))
		.mutation(async ({ ctx, input }) => {
			// Get slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: eq(mealPlanSlots.id, input.slotId),
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
				slotId: z.custom<TypeIDString<'mps'>>(),
				targetDays: z.array(z.number().int().min(0).max(6)),
				targetSlotIndex: z.number().int().min(0)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Get source slot and verify ownership
			const slot = await ctx.db.query.mealPlanSlots.findFirst({
				where: eq(mealPlanSlots.id, input.slotId),
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
				const [newSlot] = await ctx.db
					.insert(mealPlanSlots)
					.values({
						inventoryId: slot.inventoryId,
						dayOfWeek: day,
						slotIndex: input.targetSlotIndex,
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
