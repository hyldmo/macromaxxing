import { ingredients, ingredientUnits, recipeIngredients, recipes, type TypeIDString } from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq, isNotNull, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../db'
import { protectedProcedure, publicProcedure, router } from '../trpc'

async function assertRecipeOwnership(db: Database, recipeId: TypeIDString<'rcp'>, userId: string) {
	const recipe = await db.query.recipes.findFirst({
		where: and(eq(recipes.id, recipeId), eq(recipes.userId, userId))
	})
	if (!recipe) throw new TRPCError({ code: 'NOT_FOUND' })
	return recipe
}

// TODO: Replace with drizzle-zod once Buffer type detection is fixed for Cloudflare Workers
// See: https://github.com/drizzle-team/drizzle-orm/pull/5192
const insertRecipeSchema = z.object({
	name: z.string().min(1),
	instructions: z.string().optional(),
	sourceUrl: z.string().url().nullable().optional()
})

const updateRecipeSchema = z.object({
	id: z.custom<TypeIDString<'rcp'>>(),
	name: z.string().min(1).optional(),
	instructions: z.string().nullable().optional(),
	cookedWeight: z.number().positive().nullable().optional(),
	portionSize: z.number().positive().nullable().optional(),
	isPublic: z.boolean().optional()
})

const addIngredientSchema = z.object({
	recipeId: z.custom<TypeIDString<'rcp'>>(),
	ingredientId: z.custom<TypeIDString<'ing'>>(),
	amountGrams: z.number().positive(),
	displayUnit: z.string().nullable().optional(),
	displayAmount: z.number().positive().nullable().optional(),
	preparation: z.string().nullable().optional()
})

const updateIngredientSchema = z.object({
	id: z.custom<TypeIDString<'rci'>>(),
	amountGrams: z.number().positive().optional(),
	displayUnit: z.string().nullable().optional(),
	displayAmount: z.number().positive().nullable().optional(),
	preparation: z.string().nullable().optional(),
	sortOrder: z.number().int().optional()
})

export const recipesRouter = router({
	list: publicProcedure.query(async ({ ctx }) => {
		const result = await ctx.db.query.recipes.findMany({
			where: ctx.user
				? or(and(eq(recipes.isPublic, 1), eq(recipes.type, 'recipe')), eq(recipes.userId, ctx.user.id))
				: and(eq(recipes.isPublic, 1), eq(recipes.type, 'recipe')),
			with: {
				recipeIngredients: {
					with: {
						ingredient: { with: { units: true } },
						subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
					}
				}
			},
			orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)],
			limit: 50
		})
		return result
	}),

	get: publicProcedure.input(z.object({ id: z.custom<TypeIDString<'rcp'>>() })).query(async ({ ctx, input }) => {
		const recipe = await ctx.db.query.recipes.findFirst({
			where: eq(recipes.id, input.id),
			with: {
				recipeIngredients: {
					with: {
						ingredient: { with: { units: true } },
						subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
					},
					orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
				}
			}
		})
		if (!recipe) throw new Error('Recipe not found')
		const isOwner = ctx.user && recipe.userId === ctx.user.id
		if (!(recipe.isPublic || isOwner)) throw new Error('Recipe not found')
		return recipe
	}),

	create: protectedProcedure.input(insertRecipeSchema).mutation(async ({ ctx, input }) => {
		const now = Date.now()
		const [recipe] = await ctx.db
			.insert(recipes)
			.values({
				userId: ctx.user.id,
				name: input.name,
				instructions: input.instructions,
				sourceUrl: input.sourceUrl ?? null,
				createdAt: now,
				updatedAt: now
			})
			.returning()
		return recipe
	}),

	update: protectedProcedure.input(updateRecipeSchema).mutation(async ({ ctx, input }) => {
		const { id, isPublic, ...updates } = input
		await ctx.db
			.update(recipes)
			.set({
				...updates,
				...(isPublic !== undefined && { isPublic: isPublic ? 1 : 0 }),
				updatedAt: Date.now()
			})
			.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.user.id)))
		return ctx.db.query.recipes.findFirst({
			where: eq(recipes.id, id),
			with: {
				recipeIngredients: {
					with: {
						ingredient: { with: { units: true } },
						subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
					},
					orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
				}
			}
		})
	}),

	delete: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'rcp'>>() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(recipes).where(and(eq(recipes.id, input.id), eq(recipes.userId, ctx.user.id)))
		}),

	addIngredient: protectedProcedure.input(addIngredientSchema).mutation(async ({ ctx, input }) => {
		await assertRecipeOwnership(ctx.db, input.recipeId, ctx.user.id)
		// Get next sort order
		const existing = await ctx.db
			.select()
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, input.recipeId))
		const sortOrder = existing.length

		const [newIngredient] = await ctx.db
			.insert(recipeIngredients)
			.values({
				recipeId: input.recipeId,
				ingredientId: input.ingredientId,
				amountGrams: input.amountGrams,
				displayUnit: input.displayUnit ?? null,
				displayAmount: input.displayAmount ?? null,
				preparation: input.preparation ?? null,
				sortOrder
			})
			.returning()

		// Touch recipe updatedAt
		await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, input.recipeId))

		return ctx.db.query.recipeIngredients.findFirst({
			where: eq(recipeIngredients.id, newIngredient.id),
			with: {
				ingredient: { with: { units: true } },
				subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
			}
		})
	}),

	addSubrecipe: protectedProcedure
		.input(
			z.object({
				recipeId: z.custom<TypeIDString<'rcp'>>(),
				subrecipeId: z.custom<TypeIDString<'rcp'>>(),
				portions: z.number().positive().default(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			await assertRecipeOwnership(ctx.db, input.recipeId, ctx.user.id)
			// Prevent self-reference
			if (input.recipeId === input.subrecipeId) {
				throw new Error('A recipe cannot contain itself as a subrecipe')
			}

			// Cycle detection: walk subrecipeId's own subrecipes recursively
			async function hasCycle(currentId: TypeIDString<'rcp'>, targetId: TypeIDString<'rcp'>): Promise<boolean> {
				const rows = await ctx.db.query.recipeIngredients.findMany({
					where: and(eq(recipeIngredients.recipeId, currentId), isNotNull(recipeIngredients.subrecipeId))
				})
				for (const row of rows) {
					if (row.subrecipeId === targetId) return true
					if (row.subrecipeId && (await hasCycle(row.subrecipeId, targetId))) return true
				}
				return false
			}

			if (await hasCycle(input.subrecipeId, input.recipeId)) {
				throw new Error('Adding this subrecipe would create a circular reference')
			}

			// Load subrecipe to compute effective portion size
			const subrecipe = await ctx.db.query.recipes.findFirst({
				where: eq(recipes.id, input.subrecipeId),
				with: { recipeIngredients: { with: { ingredient: true } } }
			})
			if (!subrecipe) throw new Error('Subrecipe not found')

			// Calculate effective portion size
			const rawTotal = subrecipe.recipeIngredients.reduce((sum, ri) => sum + ri.amountGrams, 0)
			const effectiveCookedWeight = subrecipe.cookedWeight ?? rawTotal
			const effectivePortionSize = subrecipe.portionSize ?? effectiveCookedWeight
			const amountGrams = input.portions * effectivePortionSize

			// Get next sort order
			const existing = await ctx.db
				.select()
				.from(recipeIngredients)
				.where(eq(recipeIngredients.recipeId, input.recipeId))
			const sortOrder = existing.length

			const [newRow] = await ctx.db
				.insert(recipeIngredients)
				.values({
					recipeId: input.recipeId,
					ingredientId: null,
					subrecipeId: input.subrecipeId,
					amountGrams,
					displayUnit: 'portions',
					displayAmount: input.portions,
					sortOrder
				})
				.returning()

			await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, input.recipeId))

			return ctx.db.query.recipeIngredients.findFirst({
				where: eq(recipeIngredients.id, newRow.id),
				with: {
					ingredient: { with: { units: true } },
					subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
				}
			})
		}),

	updateIngredient: protectedProcedure.input(updateIngredientSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input
		const ri = await ctx.db.query.recipeIngredients.findFirst({ where: eq(recipeIngredients.id, id) })
		if (!ri) throw new TRPCError({ code: 'NOT_FOUND' })
		await assertRecipeOwnership(ctx.db, ri.recipeId, ctx.user.id)

		await ctx.db.update(recipeIngredients).set(updates).where(eq(recipeIngredients.id, id))

		// Touch parent recipe
		await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, ri.recipeId))

		return ctx.db.query.recipeIngredients.findFirst({
			where: eq(recipeIngredients.id, id),
			with: {
				ingredient: { with: { units: true } },
				subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
			}
		})
	}),

	removeIngredient: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'rci'>>() }))
		.mutation(async ({ ctx, input }) => {
			const ri = await ctx.db.query.recipeIngredients.findFirst({ where: eq(recipeIngredients.id, input.id) })
			if (!ri) throw new TRPCError({ code: 'NOT_FOUND' })
			await assertRecipeOwnership(ctx.db, ri.recipeId, ctx.user.id)

			await ctx.db.delete(recipeIngredients).where(eq(recipeIngredients.id, input.id))
			await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, ri.recipeId))
		}),

	addPremade: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				servingSize: z.number().positive(),
				servings: z.number().positive().default(1),
				protein: z.number().nonnegative(),
				carbs: z.number().nonnegative(),
				fat: z.number().nonnegative(),
				kcal: z.number().nonnegative(),
				fiber: z.number().nonnegative().default(0),
				sourceUrl: z.string().url().nullable().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const per100g = (value: number) => (value / input.servingSize) * 100

			// 1. Create backing ingredient with per-100g macros
			const [ingredient] = await ctx.db
				.insert(ingredients)
				.values({
					userId: ctx.user.id,
					name: input.name,
					protein: per100g(input.protein),
					carbs: per100g(input.carbs),
					fat: per100g(input.fat),
					kcal: per100g(input.kcal),
					fiber: per100g(input.fiber),
					source: 'label',
					createdAt: now
				})
				.returning()

			// 2. Add 'g' unit
			await ctx.db.insert(ingredientUnits).values({
				ingredientId: ingredient.id,
				name: 'g',
				grams: 1,
				isDefault: 1,
				source: 'manual',
				createdAt: now
			})

			// 3. Create premade recipe
			const [recipe] = await ctx.db
				.insert(recipes)
				.values({
					userId: ctx.user.id,
					name: input.name,
					type: 'premade',
					portionSize: input.servingSize,
					isPublic: 0,
					sourceUrl: input.sourceUrl ?? null,
					createdAt: now,
					updatedAt: now
				})
				.returning()

			// 4. Link ingredient to recipe
			await ctx.db.insert(recipeIngredients).values({
				recipeId: recipe.id,
				ingredientId: ingredient.id,
				amountGrams: input.servingSize * input.servings,
				sortOrder: 0
			})

			// 5. Return with populated relations
			return ctx.db.query.recipes.findFirst({
				where: eq(recipes.id, recipe.id),
				with: {
					recipeIngredients: {
						with: {
							ingredient: { with: { units: true } },
							subrecipe: { with: { recipeIngredients: { with: { ingredient: true } } } }
						},
						orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
					}
				}
			})
		})
})
