import {
	exerciseMuscles,
	exercises,
	type FatigueTier,
	MUSCLE_GROUPS,
	type SetType,
	type TypeIDString,
	workoutExercises,
	workoutLogs,
	workoutSessions,
	workouts
} from '@macromaxxing/db'
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const zExerciseType = z.enum(['compound', 'isolation'])
const zSetType = z.enum(['warmup', 'working', 'backoff'])
const zSetMode = z.enum(['working', 'warmup', 'backoff', 'full'])
const zTrainingGoal = z.enum(['hypertrophy', 'strength'])
const zMuscleGroup = z.enum(MUSCLE_GROUPS as unknown as [string, ...string[]])
type InferredMuscle = { muscleGroup: (typeof MUSCLE_GROUPS)[number]; intensity: number }
type InferredExercise = { type: 'compound' | 'isolation'; fatigueTier: FatigueTier; muscles: InferredMuscle[] }

/** Keyword-based muscle group inference from exercise name */
function inferExercise(name: string): InferredExercise {
	const n = name.toLowerCase()

	// Core / abs
	if (/\b(crunch|sit\s*-?up|ab\b|plank|core)/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'core', intensity: 1.0 }] }

	// Calves
	if (/\bcalf|calves/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'calves', intensity: 1.0 }] }

	// Rear delts
	if (/\b(face\s*pull|rear\s*delt|reverse\s*(pec|fly|deck))/i.test(n))
		return {
			type: 'isolation',
			fatigueTier: /face\s*pull/i.test(n) ? 3 : 4,
			muscles: [{ muscleGroup: 'rear_delts', intensity: 1.0 }]
		}

	// Lateral raise
	if (/\blateral\s*raise/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'side_delts', intensity: 1.0 }] }

	// Leg curl
	if (/\bleg\s*curl/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'hamstrings', intensity: 1.0 }] }

	// Leg extension
	if (/\bleg\s*ext/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'quads', intensity: 1.0 }] }

	// Tricep isolation (pushdown, extension, kickback)
	if (/\b(pushdown|tricep|skull\s*crush|overhead.*ext)/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'triceps', intensity: 1.0 }] }

	// Bicep isolation (curl variants)
	if (/\b(curl|preacher)/i.test(n)) {
		if (/\bhammer/i.test(n))
			return {
				type: 'isolation',
				fatigueTier: 3,
				muscles: [
					{ muscleGroup: 'biceps', intensity: 0.7 },
					{ muscleGroup: 'forearms', intensity: 0.5 }
				]
			}
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'biceps', intensity: 1.0 }] }
	}

	// Chest fly / pec deck
	if (/\b(fly|pec\s*deck|cable\s*cross)/i.test(n))
		return { type: 'isolation', fatigueTier: 3, muscles: [{ muscleGroup: 'chest', intensity: 1.0 }] }

	// Wrist / forearm
	if (/\b(wrist|forearm)/i.test(n))
		return { type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'forearms', intensity: 1.0 }] }

	// Shoulder / overhead press (before generic press)
	if (/\b(shoulder|overhead|ohp|military)\b.*press/i.test(n) || /\bpress.*\b(shoulder|overhead)/i.test(n))
		return {
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'front_delts', intensity: 1.0 },
				{ muscleGroup: 'side_delts', intensity: 0.5 },
				{ muscleGroup: 'triceps', intensity: 0.5 }
			]
		}

	// Leg press / squat
	if (/\b(squat|leg\s*press|hack\s*squat|goblet)/i.test(n))
		return {
			type: 'compound',
			fatigueTier: /\bsquat\b/i.test(n) && !/hack|goblet/i.test(n) ? 1 : 2,
			muscles: [
				{ muscleGroup: 'quads', intensity: 1.0 },
				{ muscleGroup: 'glutes', intensity: 0.7 },
				{ muscleGroup: 'hamstrings', intensity: 0.3 }
			]
		}

	// Bench / chest press
	if (
		/\b(bench|chest)\b.*press/i.test(n) ||
		/\bpress.*\b(bench|chest)/i.test(n) ||
		/\b(bench\s*press|db\s*press|incline.*press|decline.*press)/i.test(n)
	)
		return {
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'chest', intensity: 1.0 },
				{ muscleGroup: 'triceps', intensity: 0.5 },
				{ muscleGroup: 'front_delts', intensity: 0.3 }
			]
		}

	// Deadlift
	if (/\bdeadlift|rdl\b/i.test(n))
		return {
			type: 'compound',
			fatigueTier: /\brdl\b|romanian/i.test(n) ? 2 : 1,
			muscles: [
				{ muscleGroup: 'hamstrings', intensity: 0.8 },
				{ muscleGroup: 'glutes', intensity: 0.8 },
				{ muscleGroup: 'upper_back', intensity: 0.6 },
				{ muscleGroup: 'core', intensity: 0.5 }
			]
		}

	// Row
	if (/\brow/i.test(n))
		return {
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'upper_back', intensity: 0.8 },
				{ muscleGroup: 'lats', intensity: 0.8 },
				{ muscleGroup: 'biceps', intensity: 0.5 }
			]
		}

	// Pulldown / pull-up
	if (/\b(pulldown|pull\s*-?\s*down|pull\s*-?\s*up|chin\s*-?\s*up|lat\s*pull)/i.test(n))
		return {
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'lats', intensity: 1.0 },
				{ muscleGroup: 'upper_back', intensity: 0.6 },
				{ muscleGroup: 'biceps', intensity: 0.5 }
			]
		}

	// Generic press fallback
	if (/\bpress/i.test(n))
		return {
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'chest', intensity: 0.8 },
				{ muscleGroup: 'triceps', intensity: 0.5 },
				{ muscleGroup: 'front_delts', intensity: 0.3 }
			]
		}

	// Unknown — default to compound with empty muscles
	return { type: 'compound', fatigueTier: 2, muscles: [] }
}

export const workoutsRouter = router({
	// ─── Exercise CRUD ────────────────────────────────────────────

	listExercises: protectedProcedure
		.input(z.object({ type: zExerciseType.optional() }).optional())
		.query(async ({ ctx, input }) => {
			const typeFilter = input?.type ? eq(exercises.type, input.type) : undefined
			const userFilter = or(isNull(exercises.userId), eq(exercises.userId, ctx.user.id))
			const where = typeFilter ? and(userFilter, typeFilter) : userFilter

			return ctx.db.query.exercises.findMany({
				where,
				with: { muscles: true },
				orderBy: [exercises.name]
			})
		}),

	createExercise: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				type: zExerciseType,
				fatigueTier: z.number().int().min(1).max(4).optional(),
				muscles: z.array(z.object({ muscleGroup: zMuscleGroup, intensity: z.number().min(0).max(1) }))
			})
		)
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const tier = (input.fatigueTier ?? (input.type === 'compound' ? 2 : 4)) as FatigueTier
			const [exercise] = await ctx.db
				.insert(exercises)
				.values({ userId: ctx.user.id, name: input.name, type: input.type, fatigueTier: tier, createdAt: now })
				.returning()

			if (input.muscles.length > 0) {
				await ctx.db.insert(exerciseMuscles).values(
					input.muscles.map(m => ({
						exerciseId: exercise.id,
						muscleGroup: m.muscleGroup as (typeof MUSCLE_GROUPS)[number],
						intensity: m.intensity
					}))
				)
			}

			return ctx.db.query.exercises.findFirst({
				where: eq(exercises.id, exercise.id),
				with: { muscles: true }
			})
		}),

	// ─── Workout Templates ────────────────────────────────────────

	listWorkouts: protectedProcedure.query(async ({ ctx }) =>
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
	),

	getWorkout: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'wkt'>>() }))
		.query(async ({ ctx, input }) => {
			const workout = await ctx.db.query.workouts.findFirst({
				where: and(eq(workouts.id, input.id), eq(workouts.userId, ctx.user.id)),
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutExercises.sortOrder]
					}
				}
			})
			if (!workout) throw new Error('Workout not found')
			return workout
		}),

	createWorkout: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				trainingGoal: zTrainingGoal.default('hypertrophy'),
				exercises: z.array(
					z.object({
						exerciseId: z.custom<TypeIDString<'exc'>>(),
						targetSets: z.number().int().min(1).nullable(),
						targetReps: z.number().int().min(1).nullable(),
						targetWeight: z.number().min(0).nullable(),
						setMode: zSetMode.default('working'),
						supersetGroup: z.number().int().nullable().default(null)
					})
				)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()

			// Get next sort order
			const existing = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(workouts)
				.where(eq(workouts.userId, ctx.user.id))
			const sortOrder = existing[0]?.count ?? 0

			const [workout] = await ctx.db
				.insert(workouts)
				.values({
					userId: ctx.user.id,
					name: input.name,
					trainingGoal: input.trainingGoal,
					sortOrder,
					createdAt: now,
					updatedAt: now
				})
				.returning()

			if (input.exercises.length > 0) {
				// D1 limits to 100 bound params per query (9 cols → max 11 rows per insert)
				for (let i = 0; i < input.exercises.length; i += 11) {
					await ctx.db.insert(workoutExercises).values(
						input.exercises.slice(i, i + 11).map((e, idx) => ({
							workoutId: workout.id,
							exerciseId: e.exerciseId,
							sortOrder: i + idx,
							targetSets: e.targetSets,
							targetReps: e.targetReps,
							targetWeight: e.targetWeight,
							setMode: e.setMode,
							supersetGroup: e.supersetGroup,
							createdAt: now
						}))
					)
				}
			}

			return ctx.db.query.workouts.findFirst({
				where: eq(workouts.id, workout.id),
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutExercises.sortOrder]
					}
				}
			})
		}),

	updateWorkout: protectedProcedure
		.input(
			z.object({
				id: z.custom<TypeIDString<'wkt'>>(),
				name: z.string().min(1).optional(),
				trainingGoal: zTrainingGoal.optional(),
				sortOrder: z.number().int().min(0).optional(),
				exercises: z
					.array(
						z.object({
							exerciseId: z.custom<TypeIDString<'exc'>>(),
							targetSets: z.number().int().min(1).nullable(),
							targetReps: z.number().int().min(1).nullable(),
							targetWeight: z.number().min(0).nullable(),
							setMode: zSetMode.default('working'),
							supersetGroup: z.number().int().nullable().default(null)
						})
					)
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.workouts.findFirst({
				where: and(eq(workouts.id, input.id), eq(workouts.userId, ctx.user.id))
			})
			if (!existing) throw new Error('Workout not found')

			const now = Date.now()
			const set: Record<string, unknown> = { updatedAt: now }
			if (input.name !== undefined) set.name = input.name
			if (input.trainingGoal !== undefined) set.trainingGoal = input.trainingGoal
			if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder

			await ctx.db.update(workouts).set(set).where(eq(workouts.id, input.id))

			if (input.exercises !== undefined) {
				// Replace all exercises
				await ctx.db.delete(workoutExercises).where(eq(workoutExercises.workoutId, input.id))
				if (input.exercises.length > 0) {
					for (let i = 0; i < input.exercises.length; i += 11) {
						await ctx.db.insert(workoutExercises).values(
							input.exercises.slice(i, i + 11).map((e, idx) => ({
								workoutId: input.id,
								exerciseId: e.exerciseId,
								sortOrder: i + idx,
								targetSets: e.targetSets,
								targetReps: e.targetReps,
								targetWeight: e.targetWeight,
								setMode: e.setMode,
								supersetGroup: e.supersetGroup,
								createdAt: now
							}))
						)
					}
				}
			}

			return ctx.db.query.workouts.findFirst({
				where: eq(workouts.id, input.id),
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutExercises.sortOrder]
					}
				}
			})
		}),

	reorderWorkouts: protectedProcedure
		.input(z.object({ ids: z.array(z.custom<TypeIDString<'wkt'>>()) }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			for (let i = 0; i < input.ids.length; i++) {
				await ctx.db
					.update(workouts)
					.set({ sortOrder: i, updatedAt: now })
					.where(and(eq(workouts.id, input.ids[i]), eq(workouts.userId, ctx.user.id)))
			}
		}),

	deleteWorkout: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'wkt'>>() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(workouts).where(and(eq(workouts.id, input.id), eq(workouts.userId, ctx.user.id)))
		}),

	// ─── Sessions ─────────────────────────────────────────────────

	listSessions: protectedProcedure
		.input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
		.query(async ({ ctx, input }) =>
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
				limit: input?.limit ?? 20
			})
		),

	getSession: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'wks'>>() }))
		.query(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: and(eq(workoutSessions.id, input.id), eq(workoutSessions.userId, ctx.user.id)),
				with: {
					workout: {
						with: {
							exercises: {
								with: { exercise: { with: { muscles: true } } },
								orderBy: [workoutExercises.sortOrder]
							}
						}
					},
					logs: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: [workoutLogs.createdAt]
					}
				}
			})
			if (!session) throw new Error('Session not found')
			return session
		}),

	createSession: protectedProcedure
		.input(z.object({ workoutId: z.custom<TypeIDString<'wkt'>>(), name: z.string().optional() }))
		.mutation(async ({ ctx, input }) => {
			// Verify workout ownership
			const workout = await ctx.db.query.workouts.findFirst({
				where: and(eq(workouts.id, input.workoutId), eq(workouts.userId, ctx.user.id))
			})
			if (!workout) throw new Error('Workout not found')

			const now = Date.now()
			const [session] = await ctx.db
				.insert(workoutSessions)
				.values({
					userId: ctx.user.id,
					workoutId: input.workoutId,
					name: input.name ?? workout.name,
					startedAt: now,
					createdAt: now
				})
				.returning()
			return session
		}),

	completeSession: protectedProcedure
		.input(
			z.object({
				id: z.custom<TypeIDString<'wks'>>(),
				notes: z.string().optional(),
				templateUpdates: z
					.array(
						z.object({
							exerciseId: z.custom<TypeIDString<'exc'>>(),
							targetSets: z.number().int().min(1).nullable().optional(),
							targetReps: z.number().int().min(1).nullable().optional(),
							targetWeight: z.number().min(0).nullable().optional()
						})
					)
					.optional(),
				addExercises: z
					.array(
						z.object({
							exerciseId: z.custom<TypeIDString<'exc'>>(),
							targetSets: z.number().int().min(1).nullable(),
							targetReps: z.number().int().min(1).nullable(),
							targetWeight: z.number().min(0).nullable(),
							setMode: zSetMode.default('working')
						})
					)
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: and(eq(workoutSessions.id, input.id), eq(workoutSessions.userId, ctx.user.id))
			})
			if (!session) throw new Error('Session not found')

			await ctx.db
				.update(workoutSessions)
				.set({ completedAt: Date.now(), notes: input.notes ?? null })
				.where(eq(workoutSessions.id, input.id))

			// Apply template updates if provided
			if ((input.templateUpdates?.length || input.addExercises?.length) && session.workoutId) {
				const workoutId = session.workoutId

				if (input.templateUpdates?.length) {
					const now = Date.now()
					for (const update of input.templateUpdates) {
						const set: Record<string, unknown> = {}
						if (update.targetSets !== undefined) set.targetSets = update.targetSets
						if (update.targetReps !== undefined) set.targetReps = update.targetReps
						if (update.targetWeight !== undefined) set.targetWeight = update.targetWeight
						if (Object.keys(set).length === 0) continue

						await ctx.db
							.update(workoutExercises)
							.set(set)
							.where(
								and(
									eq(workoutExercises.workoutId, workoutId),
									eq(workoutExercises.exerciseId, update.exerciseId)
								)
							)
					}
					await ctx.db.update(workouts).set({ updatedAt: now }).where(eq(workouts.id, workoutId))
				}

				// Add new exercises to template
				if (input.addExercises?.length) {
					const now = Date.now()
					const existingCount = await ctx.db
						.select({ count: sql<number>`count(*)` })
						.from(workoutExercises)
						.where(eq(workoutExercises.workoutId, workoutId))
					let sortOrder = existingCount[0]?.count ?? 0

					for (const ex of input.addExercises) {
						await ctx.db.insert(workoutExercises).values({
							workoutId,
							exerciseId: ex.exerciseId,
							sortOrder: sortOrder++,
							targetSets: ex.targetSets,
							targetReps: ex.targetReps,
							targetWeight: ex.targetWeight,
							setMode: ex.setMode,
							createdAt: now
						})
					}
					await ctx.db.update(workouts).set({ updatedAt: now }).where(eq(workouts.id, workoutId))
				}
			}
		}),

	deleteSession: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'wks'>>() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(workoutSessions)
				.where(and(eq(workoutSessions.id, input.id), eq(workoutSessions.userId, ctx.user.id)))
		}),

	// ─── Set Logging ──────────────────────────────────────────────

	addSet: protectedProcedure
		.input(
			z.object({
				sessionId: z.custom<TypeIDString<'wks'>>(),
				exerciseId: z.custom<TypeIDString<'exc'>>(),
				weightKg: z.number().min(0),
				reps: z.number().int().min(0),
				setType: zSetType.default('working'),
				rpe: z.number().min(6).max(10).optional(),
				failureFlag: z.boolean().default(false)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Auto-assign set number per exercise in session
			const existing = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(workoutLogs)
				.where(and(eq(workoutLogs.sessionId, input.sessionId), eq(workoutLogs.exerciseId, input.exerciseId)))
			const setNumber = (existing[0]?.count ?? 0) + 1

			const [log] = await ctx.db
				.insert(workoutLogs)
				.values({
					sessionId: input.sessionId,
					exerciseId: input.exerciseId,
					setNumber,
					setType: input.setType,
					weightKg: input.weightKg,
					reps: input.reps,
					rpe: input.rpe ?? null,
					failureFlag: input.failureFlag ? 1 : 0,
					createdAt: Date.now()
				})
				.returning()
			return log
		}),

	updateSet: protectedProcedure
		.input(
			z.object({
				id: z.custom<TypeIDString<'wkl'>>(),
				weightKg: z.number().min(0).optional(),
				reps: z.number().int().min(0).optional(),
				setType: zSetType.optional(),
				rpe: z.number().min(6).max(10).nullable().optional(),
				failureFlag: z.boolean().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updates } = input
			const set: Record<string, unknown> = {}
			if (updates.weightKg !== undefined) set.weightKg = updates.weightKg
			if (updates.reps !== undefined) set.reps = updates.reps
			if (updates.setType !== undefined) set.setType = updates.setType
			if (updates.rpe !== undefined) set.rpe = updates.rpe
			if (updates.failureFlag !== undefined) set.failureFlag = updates.failureFlag ? 1 : 0
			if (Object.keys(set).length === 0) return

			// Verify ownership via session
			const log = await ctx.db.query.workoutLogs.findFirst({
				where: eq(workoutLogs.id, id),
				with: { session: true }
			})
			if (!log || log.session.userId !== ctx.user.id) throw new Error('Set not found')

			await ctx.db.update(workoutLogs).set(set).where(eq(workoutLogs.id, id))
		}),

	removeSet: protectedProcedure
		.input(z.object({ id: z.custom<TypeIDString<'wkl'>>() }))
		.mutation(async ({ ctx, input }) => {
			const log = await ctx.db.query.workoutLogs.findFirst({
				where: eq(workoutLogs.id, input.id),
				with: { session: true }
			})
			if (!log || log.session.userId !== ctx.user.id) throw new Error('Set not found')
			await ctx.db.delete(workoutLogs).where(eq(workoutLogs.id, input.id))
		}),

	// ─── Stats ────────────────────────────────────────────────────

	muscleGroupStats: protectedProcedure
		.input(z.object({ days: z.number().int().min(1).default(7) }).optional())
		.query(async ({ ctx, input }) => {
			const days = input?.days ?? 7
			const since = Date.now() - days * 24 * 60 * 60 * 1000

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: and(eq(workoutSessions.userId, ctx.user.id), gte(workoutSessions.startedAt, since)),
				with: {
					logs: {
						with: { exercise: { with: { muscles: true } } }
					}
				}
			})

			const stats = new Map<string, { weeklyVolume: number; lastTrained: number; sessionCount: number }>()

			// Initialize all groups
			for (const mg of MUSCLE_GROUPS) {
				stats.set(mg, { weeklyVolume: 0, lastTrained: 0, sessionCount: 0 })
			}

			for (const session of sessions) {
				const sessionMuscles = new Set<string>()
				for (const log of session.logs) {
					if (log.setType === 'warmup') continue
					const volume = log.weightKg * log.reps
					for (const muscle of log.exercise.muscles) {
						const existing = stats.get(muscle.muscleGroup)!
						existing.weeklyVolume += volume * muscle.intensity
						if (session.startedAt > existing.lastTrained) {
							existing.lastTrained = session.startedAt
						}
						sessionMuscles.add(muscle.muscleGroup)
					}
				}
				for (const mg of sessionMuscles) {
					stats.get(mg)!.sessionCount++
				}
			}

			return Array.from(stats.entries()).map(([muscleGroup, data]) => ({
				muscleGroup,
				...data
			}))
		}),

	/** Coverage stats: weekly sets per muscle assuming all templates are done once */
	coverageStats: protectedProcedure.query(async ({ ctx }) => {
		const userWorkouts = await ctx.db.query.workouts.findMany({
			where: eq(workouts.userId, ctx.user.id),
			with: {
				exercises: {
					with: { exercise: { with: { muscles: true } } }
				}
			},
			orderBy: [workouts.sortOrder]
		})

		// Initialize all muscle groups to 0
		const muscleVolume = new Map<string, number>()
		for (const mg of MUSCLE_GROUPS) muscleVolume.set(mg, 0)

		// Sum Σ(targetSets × muscleIntensity) across ALL exercises in ALL templates
		for (const workout of userWorkouts) {
			for (const wkExercise of workout.exercises) {
				const sets = wkExercise.targetSets ?? (workout.trainingGoal === 'strength' ? 5 : 3)
				for (const muscle of wkExercise.exercise.muscles) {
					const volume = sets * muscle.intensity
					muscleVolume.set(muscle.muscleGroup, (muscleVolume.get(muscle.muscleGroup) ?? 0) + volume)
				}
			}
		}

		return Array.from(muscleVolume.entries()).map(([muscleGroup, weeklySets]) => ({
			muscleGroup,
			weeklySets
		}))
	}),

	// ─── Generators ───────────────────────────────────────────────

	generateWarmup: protectedProcedure
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1)
			})
		)
		.query(({ input }) => {
			const { workingWeight } = input
			const bar = 20
			const round = (w: number) => Math.round(w / 2.5) * 2.5

			const sets: Array<{ weightKg: number; reps: number; setType: 'warmup' }> = []

			if (workingWeight > bar * 2) {
				sets.push({ weightKg: bar, reps: 10, setType: 'warmup' })
			}

			const pcts = [0.5, 0.7, 0.85]
			for (const pct of pcts) {
				const w = round(workingWeight * pct)
				if (w <= bar) continue
				// Skip if too close to working weight (within 5kg)
				if (workingWeight - w < 5) continue
				// Skip if same as last added set
				if (sets.length > 0 && sets[sets.length - 1].weightKg === w) continue
				const reps = pct <= 0.5 ? 8 : pct <= 0.7 ? 5 : 3
				sets.push({ weightKg: w, reps, setType: 'warmup' })
			}

			return sets
		}),

	generateBackoff: protectedProcedure
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1),
				count: z.number().int().min(1).max(5).default(2)
			})
		)
		.query(({ input }) => {
			const { workingWeight, workingReps, count } = input
			const round = (w: number) => Math.round(w / 2.5) * 2.5

			const sets: Array<{ weightKg: number; reps: number; setType: 'backoff' }> = []
			for (let i = 0; i < count; i++) {
				const pct = 0.8 - i * 0.1
				sets.push({
					weightKg: round(workingWeight * pct),
					reps: workingReps + 2 * (i + 1),
					setType: 'backoff'
				})
			}
			return sets
		}),

	importWorkouts: protectedProcedure.input(z.object({ text: z.string().min(1) })).mutation(async ({ ctx, input }) => {
		const allExercises = await ctx.db.query.exercises.findMany({
			where: or(isNull(exercises.userId), eq(exercises.userId, ctx.user.id))
		})
		const exerciseCache = new Map(allExercises.map(e => [e.name.toLowerCase(), e]))

		const lines = input.text
			.split('\n')
			.map(l => l.trim())
			.filter(Boolean)
		if (lines.length === 0) throw new Error('No data to import')

		const isSpreadsheet = /\breps\b/i.test(lines[0]) && /\bweight/i.test(lines[0])
		let setsPerExercise = 3
		if (isSpreadsheet) {
			const m = lines[0].match(/(\d+)\s*sets/i)
			if (m) setsPerExercise = Number.parseInt(m[1], 10)
		}

		type ParsedRow = { exerciseName: string; reps: number; weightKg: number }
		type ParsedWorkout = { name: string; rows: ParsedRow[] }
		const parsed: ParsedWorkout[] = []
		let current: ParsedWorkout = { name: 'Imported Workout', rows: [] }

		const startLine = isSpreadsheet ? 1 : 0
		for (let i = startLine; i < lines.length; i++) {
			const line = lines[i]
			const parts = line.includes('\t') ? line.split('\t') : line.split(',')
			if (parts.length < 2) continue
			const col0 = parts[0].trim()

			if (isSpreadsheet && /^session\s+\d+/i.test(col0)) {
				if (current.rows.length > 0) parsed.push(current)
				const focus = parts[2]?.trim() || parts[1]?.trim() || ''
				current = { name: focus || col0, rows: [] }
				continue
			}

			if (isSpreadsheet) {
				if (!col0) continue
				const reps = Number.parseInt(parts[1]?.trim() ?? '', 10)
				if (Number.isNaN(reps)) continue
				const weightStr = (parts[2] ?? '').trim().replace(/\s*kg\s*/i, '')
				const weightKg = weightStr ? Number.parseFloat(weightStr) : 0
				current.rows.push({ exerciseName: col0, reps, weightKg })
			} else {
				if (parts.length < 3) continue
				const weight = Number.parseFloat(parts[1].trim())
				const reps = Number.parseInt(parts[2].trim(), 10)
				if (!col0 || Number.isNaN(weight) || Number.isNaN(reps)) continue
				current.rows.push({ exerciseName: col0, reps, weightKg: weight })
			}
		}
		if (current.rows.length > 0) parsed.push(current)

		// Get next sort order
		const existingCount = await ctx.db
			.select({ count: sql<number>`count(*)` })
			.from(workouts)
			.where(eq(workouts.userId, ctx.user.id))
		let sortOrder = existingCount[0]?.count ?? 0

		let workoutsCreated = 0
		let exercisesCreated = 0

		for (const pw of parsed) {
			const now = Date.now()

			// Resolve exercises
			const resolvedExercises: Array<{
				exerciseId: TypeIDString<'exc'>
				targetSets: number
				targetReps: number
				targetWeight: number | null
				setMode: 'working' | 'warmup' | 'backoff' | 'full'
			}> = []

			for (const row of pw.rows) {
				let exercise = exerciseCache.get(row.exerciseName.toLowerCase())
				if (!exercise) {
					const inferred = inferExercise(row.exerciseName)
					const [created] = await ctx.db
						.insert(exercises)
						.values({
							userId: ctx.user.id,
							name: row.exerciseName,
							type: inferred.type,
							fatigueTier: inferred.fatigueTier,
							createdAt: now
						})
						.returning()

					if (inferred.muscles.length > 0) {
						await ctx.db.insert(exerciseMuscles).values(
							inferred.muscles.map(m => ({
								exerciseId: created.id,
								muscleGroup: m.muscleGroup,
								intensity: m.intensity
							}))
						)
					}
					exercise = created
					exerciseCache.set(row.exerciseName.toLowerCase(), created)
					exercisesCreated++
				}

				resolvedExercises.push({
					exerciseId: exercise.id,
					targetSets: isSpreadsheet ? setsPerExercise : 1,
					targetReps: row.reps,
					targetWeight: row.weightKg > 0 ? row.weightKg : null,
					setMode: exercise.type === 'compound' ? 'warmup' : 'working'
				})
			}

			const [workout] = await ctx.db
				.insert(workouts)
				.values({
					userId: ctx.user.id,
					name: pw.name,
					sortOrder: sortOrder++,
					createdAt: now,
					updatedAt: now
				})
				.returning()

			for (let i = 0; i < resolvedExercises.length; i += 12) {
				await ctx.db.insert(workoutExercises).values(
					resolvedExercises.slice(i, i + 12).map((e, idx) => ({
						workoutId: workout.id,
						exerciseId: e.exerciseId,
						sortOrder: i + idx,
						targetSets: e.targetSets,
						targetReps: e.targetReps,
						targetWeight: e.targetWeight,
						setMode: e.setMode,
						createdAt: now
					}))
				)
			}
			workoutsCreated++
		}

		return { workoutsCreated, exercisesCreated }
	}),

	importSets: protectedProcedure
		.input(
			z.object({
				sessionId: z.custom<TypeIDString<'wks'>>().optional(),
				workoutId: z.custom<TypeIDString<'wkt'>>(),
				text: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Load all available exercises for matching
			const allExercises = await ctx.db.query.exercises.findMany({
				where: or(isNull(exercises.userId), eq(exercises.userId, ctx.user.id))
			})
			const exerciseCache = new Map(allExercises.map(e => [e.name.toLowerCase(), e]))

			const lines = input.text
				.split('\n')
				.map(l => l.trim())
				.filter(Boolean)

			// Detect format: spreadsheet (has header with "Reps" and "Weight") vs simple CSV
			const isSpreadsheet = /\breps\b/i.test(lines[0]) && /\bweight/i.test(lines[0])

			// Parse set count from header like "Reps (3 sets)"
			let setsPerExercise = 3
			if (isSpreadsheet) {
				const setMatch = lines[0].match(/(\d+)\s*sets/i)
				if (setMatch) setsPerExercise = Number.parseInt(setMatch[1], 10)
			}

			// Parsed rows grouped by session
			type ParsedRow = { exerciseName: string; reps: number; weightKg: number }
			type ParsedSession = { name: string; rows: ParsedRow[] }
			const sessions: ParsedSession[] = []
			let currentSession: ParsedSession = { name: 'Imported Session', rows: [] }

			const startLine = isSpreadsheet ? 1 : 0 // skip header for spreadsheet

			for (let i = startLine; i < lines.length; i++) {
				const line = lines[i]
				const parts = line.includes('\t') ? line.split('\t') : line.split(',')
				if (parts.length < 2) continue

				const col0 = parts[0].trim()

				// Detect session header: "Session N <tab> location <tab> focus"
				if (isSpreadsheet && /^session\s+\d+/i.test(col0)) {
					if (currentSession.rows.length > 0) sessions.push(currentSession)
					const focus = parts[2]?.trim() || parts[1]?.trim() || ''
					currentSession = { name: `${col0}${focus ? ` — ${focus}` : ''}`, rows: [] }
					continue
				}

				if (isSpreadsheet) {
					// Spreadsheet: Exercise \t Reps \t Weight
					const exerciseName = col0
					if (!exerciseName) continue

					// Parse reps: handle ranges like "6-10" → take first number
					const repsStr = parts[1]?.trim() ?? ''
					const reps = Number.parseInt(repsStr, 10)
					if (Number.isNaN(reps)) continue

					// Parse weight: strip "kg" suffix, empty = 0 (bodyweight)
					const weightStr = (parts[2] ?? '').trim().replace(/\s*kg\s*/i, '')
					const weightKg = weightStr ? Number.parseFloat(weightStr) : 0

					currentSession.rows.push({ exerciseName, reps, weightKg })
				} else {
					// Simple CSV: Exercise, Weight, Reps, RPE?
					if (parts.length < 3) continue
					const exerciseName = col0
					const weight = Number.parseFloat(parts[1].trim())
					const reps = Number.parseInt(parts[2].trim(), 10)
					if (!exerciseName || Number.isNaN(weight) || Number.isNaN(reps)) continue
					currentSession.rows.push({ exerciseName, reps, weightKg: weight })
				}
			}
			if (currentSession.rows.length > 0) sessions.push(currentSession)

			// If caller provided a sessionId, merge all into that single session
			// Otherwise create one session per parsed session block
			let totalSets = 0
			let exercisesCreated = 0
			let lastSessionId = input.sessionId

			for (const parsed of sessions) {
				let sessionId = input.sessionId
				if (!sessionId) {
					const now = Date.now()
					const [created] = await ctx.db
						.insert(workoutSessions)
						.values({
							userId: ctx.user.id,
							workoutId: input.workoutId,
							name: parsed.name,
							startedAt: now,
							createdAt: now
						})
						.returning()
					sessionId = created.id
				}
				lastSessionId = sessionId

				const logs: Array<{
					sessionId: TypeIDString<'wks'>
					exerciseId: TypeIDString<'exc'>
					setNumber: number
					setType: SetType
					weightKg: number
					reps: number
					rpe: number | null
					failureFlag: number
					createdAt: number
				}> = []
				const exerciseSetCounts = new Map<string, number>()

				for (const row of parsed.rows) {
					// Find or auto-create exercise
					let exercise = exerciseCache.get(row.exerciseName.toLowerCase())
					if (!exercise) {
						const inferred = inferExercise(row.exerciseName)
						const now = Date.now()
						const [created] = await ctx.db
							.insert(exercises)
							.values({
								userId: ctx.user.id,
								name: row.exerciseName,
								type: inferred.type,
								fatigueTier: inferred.fatigueTier,
								createdAt: now
							})
							.returning()

						if (inferred.muscles.length > 0) {
							await ctx.db.insert(exerciseMuscles).values(
								inferred.muscles.map(m => ({
									exerciseId: created.id,
									muscleGroup: m.muscleGroup,
									intensity: m.intensity
								}))
							)
						}

						exercise = created
						exerciseCache.set(row.exerciseName.toLowerCase(), created)
						exercisesCreated++
					}

					// Expand to N sets (spreadsheet format) or 1 set (simple CSV)
					const setCount = isSpreadsheet ? setsPerExercise : 1
					for (let s = 0; s < setCount; s++) {
						const key = exercise.id
						const setNum = (exerciseSetCounts.get(key) ?? 0) + 1
						exerciseSetCounts.set(key, setNum)

						logs.push({
							sessionId,
							exerciseId: exercise.id,
							setNumber: setNum,
							setType: 'working',
							weightKg: row.weightKg,
							reps: row.reps,
							rpe: null,
							failureFlag: 0,
							createdAt: Date.now()
						})
					}
				}

				// D1 limits to 100 bound params per query (10 cols → max 10 rows per insert)
				for (let i = 0; i < logs.length; i += 10) {
					await ctx.db.insert(workoutLogs).values(logs.slice(i, i + 10))
				}
				totalSets += logs.length
			}

			return {
				sessionId: lastSessionId!,
				sessionsCreated: input.sessionId ? 0 : sessions.length,
				setsImported: totalSets,
				exercisesCreated
			}
		}),

	// ─── Strength Standards ────────────────────────────────────────

	listStandards: protectedProcedure.query(async ({ ctx }) =>
		ctx.db.query.strengthStandards.findMany({
			with: {
				compound: true,
				isolation: true
			}
		})
	)
})
