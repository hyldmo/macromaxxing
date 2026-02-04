import { and, eq } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'
import { ingredients } from '../schema'
import { protectedProcedure, router } from '../trpc'

const createIngredientSchema = createInsertSchema(ingredients).pick({
	name: true,
	protein: true,
	carbs: true,
	fat: true,
	kcal: true,
	fiber: true,
	source: true
})

const updateIngredientSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	protein: z.number().min(0).optional(),
	carbs: z.number().min(0).optional(),
	fat: z.number().min(0).optional(),
	kcal: z.number().min(0).optional(),
	fiber: z.number().min(0).optional()
})

export const ingredientsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.ingredients.findMany({
			where: eq(ingredients.userId, ctx.user.id),
			orderBy: (ingredients, { asc }) => [asc(ingredients.name)]
		})
	}),

	create: protectedProcedure.input(createIngredientSchema).mutation(async ({ ctx, input }) => {
		const id = crypto.randomUUID()
		await ctx.db.insert(ingredients).values({
			id,
			userId: ctx.user.id,
			...input,
			createdAt: Date.now()
		})
		return ctx.db.query.ingredients.findFirst({ where: eq(ingredients.id, id) })
	}),

	update: protectedProcedure.input(updateIngredientSchema).mutation(async ({ ctx, input }) => {
		const { id, ...updates } = input
		await ctx.db
			.update(ingredients)
			.set(updates)
			.where(and(eq(ingredients.id, id), eq(ingredients.userId, ctx.user.id)))
		return ctx.db.query.ingredients.findFirst({ where: eq(ingredients.id, id) })
	}),

	delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
		await ctx.db.delete(ingredients).where(and(eq(ingredients.id, input.id), eq(ingredients.userId, ctx.user.id)))
	})
})
