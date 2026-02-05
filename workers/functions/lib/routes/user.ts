import { protectedProcedure, router } from '../trpc'

export const userRouter = router({
	me: protectedProcedure.query(({ ctx }) => ({
		id: ctx.user.id,
		email: ctx.user.email
	}))
})
