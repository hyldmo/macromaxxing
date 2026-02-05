import { recipeIngredients, recipes, type TypeIDString } from '@macromaxxing/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

// TODO: Replace with drizzle-zod once Buffer type detection is fixed for Cloudflare Workers
// See: https://github.com/drizzle-team/drizzle-orm/pull/5192
const insertRecipeSchema = z.object({
	name: z.string().min(1)
})

const updateRecipeSchema = z.object({
	id: z.custom<TypeIDString<'rcp'>>(),
	name: z.string().min(1).optional(),
	cookedWeight: z.number().positive().nullable().optional(),
	portionSize: z.number().positive().optional()
})

const addIngredientSchema = z.object({
	recipeId: z.custom<TypeIDString<'rcp'>>(),
	ingredientId: z.custom<TypeIDString<'ing'>>(),
	amountGrams: z.number().positive()
})

const updateIngredientSchema = z.object({
	id: z.custom<TypeIDString<'rci'>>(),
	amountGrams: z.number().positive().optional(),
	sortOrder: z.number().int().optional()
})

export const recipesRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const result = await ctx.db.query.recipes.findMany({
			where: eq(recipes.userId, ctx.user.id),
			with: { recipeIngredients: { with: { ingredient: true } } },
			orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)]
		})
		return result
	}),

	get: protectedProcedure.input(z.object({ id: z.custom<TypeIDString<'rcp'>>() })).query(async ({ ctx, input }) => {
		const recipe = await ctx.db.query.recipes.findFirst({
			where: and(eq(recipes.id, input.id), eq(recipes.userId, ctx.user.id)),
			with: {
				recipeIngredients: {
					with: { ingredient: true },
					orderBy: (ri, { asc }) => [asc(ri.sortOrder)]
				}
			}
		})
		if (!recipe) throw new Error('Recipe not found')
		return recipe
	}),

	create: protectedProcedure.input(insertRecipeSchema).mutation(async ({ ctx, input }) => {
		const now = Date.now()
		const [recipe] = await ctx.db
			.insert(recipes)
			.values({
				userId: ctx.user.id,
				name: input.name,
				createdAt: now,
				updatedAt: now
			})
			.returning()
		return recipe
	}),

	update: protectedProcedure.input(updateRecipeSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input
		await ctx.db
			.update(recipes)
			.set({ ...updates, updatedAt: Date.now() })
			.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.user.id)))
		return ctx.db.query.recipes.findFirst({
			where: eq(recipes.id, id),
			with: {
				recipeIngredients: {
					with: { ingredient: true },
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
				sortOrder
			})
			.returning()

		// Touch recipe updatedAt
		await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, input.recipeId))

		return ctx.db.query.recipeIngredients.findFirst({
			where: eq(recipeIngredients.id, newIngredient.id),
			with: { ingredient: true }
		})
	}),

	updateIngredient: protectedProcedure.input(updateIngredientSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input
		await ctx.db.update(recipeIngredients).set(updates).where(eq(recipeIngredients.id, id))

		// Touch parent recipe
		const ri = await ctx.db.query.recipeIngredients.findFirst({ where: eq(recipeIngredients.id, id) })
		if (ri) {
			await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, ri.recipeId))
		}

		return ctx.db.query.recipeIngredients.findFirst({
			where: eq(recipeIngredients.id, id),
			with: { ingredient: true }
		})
	}),

	removeIngredient: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'rci'>>() }))
		.mutation(async ({ ctx, input }) => {
			const ri = await ctx.db.query.recipeIngredients.findFirst({ where: eq(recipeIngredients.id, input.id) })
			await ctx.db.delete(recipeIngredients).where(eq(recipeIngredients.id, input.id))
			if (ri) {
				await ctx.db.update(recipes).set({ updatedAt: Date.now() }).where(eq(recipes.id, ri.recipeId))
			}
		})
})
