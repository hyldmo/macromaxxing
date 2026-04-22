import {
	computeBalances,
	computeMuscleLoad,
	type ExerciseType,
	exerciseGuides,
	exerciseMuscles,
	exercises,
	exerciseType,
	type FatigueTier,
	MUSCLE_GROUPS,
	type MuscleContribution,
	type MuscleGroup,
	newId,
	type SetType,
	sessionPlannedExercises,
	setMode,
	sumTotals,
	type TrainingGoal,
	type TypeIDString,
	trainingGoal,
	withZones,
	workoutExercises,
	workoutLogs,
	workoutSessions,
	workouts,
	zodTypeID
} from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, publicProcedure, router } from '../trpc'

const CUE_MAX = 300
const DESCRIPTION_MAX = 500
const CUES_MAX_COUNT = 10

const zGuideInput = z.object({
	description: z.string().min(10).max(DESCRIPTION_MAX),
	cues: z.array(z.string().min(3).max(CUE_MAX)).min(1).max(CUES_MAX_COUNT),
	pitfalls: z.array(z.string().min(3).max(CUE_MAX)).max(CUES_MAX_COUNT).nullable()
})

const zSetType = z.enum(['warmup', 'working', 'backoff'])

type InferredMuscle = { muscleGroup: MuscleGroup; intensity: number }
type InferredExercise = { type: ExerciseType; fatigueTier: FatigueTier; muscles: InferredMuscle[] }

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

/** Shared `with` for workout template queries */
const workoutExercisesWith = {
	exercises: {
		with: { exercise: { with: { muscles: true } } },
		orderBy: { sortOrder: 'asc' as const }
	}
} as const

export const workoutsRouter = router({
	// ─── Exercise CRUD ────────────────────────────────────────────

	listExercises: protectedProcedure
		.meta({ description: 'List available exercises (system catalog + user-created) with muscle mappings' })
		.input(z.object({ type: exerciseType.optional() }).optional())
		.query(async ({ ctx, input }) => {
			const typeFilter = input?.type ? { type: input.type } : {}
			return ctx.db.query.exercises.findMany({
				where: {
					OR: [{ userId: { isNull: true } }, { userId: ctx.user.id }],
					...typeFilter
				},
				with: { muscles: true },
				orderBy: { name: 'asc' }
			})
		}),

	createExercise: protectedProcedure
		.meta({ description: 'Create a custom exercise with muscle group intensities and training rep ranges' })
		.input(
			z.object({
				name: z.string().min(1),
				type: exerciseType,
				fatigueTier: z.number().int().min(1).max(4).optional(),
				muscles: z.array(z.object({ muscleGroup: z.enum(MUSCLE_GROUPS), intensity: z.number().min(0).max(1) })),
				strengthRepsMin: z.number().int().min(1).nullable(),
				strengthRepsMax: z.number().int().min(1).nullable(),
				hypertrophyRepsMin: z.number().int().min(1).nullable(),
				hypertrophyRepsMax: z.number().int().min(1).nullable()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const tier = (input.fatigueTier ?? (input.type === 'compound' ? 2 : 4)) as FatigueTier
			const [exercise] = await ctx.db
				.insert(exercises)
				.values({ ...input, userId: ctx.user.id, fatigueTier: tier, createdAt: now })
				.returning()

			if (input.muscles.length > 0) {
				await ctx.db.insert(exerciseMuscles).values(
					input.muscles.map(m => ({
						exerciseId: exercise.id,
						muscleGroup: m.muscleGroup,
						intensity: m.intensity
					}))
				)
			}

			return ctx.db.query.exercises.findFirst({
				where: { id: exercise.id },
				with: { muscles: true }
			})
		}),

	updateExercise: protectedProcedure
		.meta({ description: 'Update a custom exercise (system exercises are read-only)' })
		.input(
			z.object({
				id: zodTypeID('exc'),
				name: z.string().min(1).optional(),
				type: exerciseType.optional(),
				fatigueTier: z.number().int().min(1).max(4).optional(),
				strengthRepsMin: z.number().int().min(1).nullable().optional(),
				strengthRepsMax: z.number().int().min(1).nullable().optional(),
				hypertrophyRepsMin: z.number().int().min(1).nullable().optional(),
				hypertrophyRepsMax: z.number().int().min(1).nullable().optional(),
				muscles: z
					.array(z.object({ muscleGroup: z.enum(MUSCLE_GROUPS), intensity: z.number().min(0).max(1) }))
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.exercises.findFirst({
				where: { id: input.id }
			})
			if (!existing || existing.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' })
			}

			const { id, muscles, ...fields } = input
			const set: Record<string, unknown> = {}
			if (fields.name !== undefined) set.name = fields.name
			if (fields.type !== undefined) set.type = fields.type
			if (fields.fatigueTier !== undefined) set.fatigueTier = fields.fatigueTier
			if (fields.strengthRepsMin !== undefined) set.strengthRepsMin = fields.strengthRepsMin
			if (fields.strengthRepsMax !== undefined) set.strengthRepsMax = fields.strengthRepsMax
			if (fields.hypertrophyRepsMin !== undefined) set.hypertrophyRepsMin = fields.hypertrophyRepsMin
			if (fields.hypertrophyRepsMax !== undefined) set.hypertrophyRepsMax = fields.hypertrophyRepsMax

			if (Object.keys(set).length > 0) {
				await ctx.db.update(exercises).set(set).where(eq(exercises.id, id))
			}

			if (muscles !== undefined) {
				await ctx.db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, id))
				if (muscles.length > 0) {
					await ctx.db.insert(exerciseMuscles).values(
						muscles.map(m => ({
							exerciseId: id,
							muscleGroup: m.muscleGroup,
							intensity: m.intensity
						}))
					)
				}
			}

			return ctx.db.query.exercises.findFirst({
				where: { id },
				with: { muscles: true }
			})
		}),

	deleteExercise: protectedProcedure
		.meta({ description: 'Delete a custom exercise' })
		.input(z.object({ id: zodTypeID('exc') }))
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.exercises.findFirst({
				where: { id: input.id }
			})
			if (!existing || existing.userId !== ctx.user.id) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' })
			}

			// Check if exercise is used in any workout templates or session plans
			const [templateRef] = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(workoutExercises)
				.where(eq(workoutExercises.exerciseId, input.id))
			const [sessionRef] = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(sessionPlannedExercises)
				.where(eq(sessionPlannedExercises.exerciseId, input.id))

			if ((templateRef?.count ?? 0) > 0 || (sessionRef?.count ?? 0) > 0) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'Exercise is used in workout templates. Remove it first.'
				})
			}

			await ctx.db.delete(exercises).where(eq(exercises.id, input.id))
		}),

	// ─── Exercise Guides ──────────────────────────────────────────

	getGuide: publicProcedure
		.meta({ description: 'Get the technique guide (description, cues, pitfalls) for an exercise' })
		.input(z.object({ exerciseId: zodTypeID('exc') }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.exerciseGuides.findFirst({
				where: { exerciseId: input.exerciseId }
			})
			if (!row) return null
			const cuesParsed: unknown = JSON.parse(row.cues)
			const pitfallsParsed: unknown = row.pitfalls === null ? null : JSON.parse(row.pitfalls)
			const cues: string[] = Array.isArray(cuesParsed)
				? cuesParsed.filter((c): c is string => typeof c === 'string')
				: []
			const pitfalls: string[] | null = Array.isArray(pitfallsParsed)
				? pitfallsParsed.filter((p): p is string => typeof p === 'string')
				: null
			return {
				id: row.id,
				exerciseId: row.exerciseId,
				description: row.description,
				cues,
				pitfalls,
				updatedAt: row.updatedAt
			}
		}),

	upsertGuide: protectedProcedure
		.meta({
			description:
				'Create or update the technique guide for an exercise. Only the exercise owner may edit their own guides; system exercises are seeded via script.'
		})
		.input(zGuideInput.extend({ exerciseId: zodTypeID('exc') }))
		.mutation(async ({ ctx, input }) => {
			const exercise = await ctx.db.query.exercises.findFirst({ where: { id: input.exerciseId } })
			if (!exercise) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' })
			}
			if (exercise.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'System exercise guides are read-only. You can only edit guides for your own exercises.'
				})
			}

			const now = Date.now()
			const cuesJson = JSON.stringify(input.cues)
			const pitfallsJson = input.pitfalls === null ? null : JSON.stringify(input.pitfalls)

			const existing = await ctx.db.query.exerciseGuides.findFirst({
				where: { exerciseId: input.exerciseId }
			})

			if (existing) {
				await ctx.db
					.update(exerciseGuides)
					.set({ description: input.description, cues: cuesJson, pitfalls: pitfallsJson, updatedAt: now })
					.where(eq(exerciseGuides.id, existing.id))
			} else {
				await ctx.db.insert(exerciseGuides).values({
					id: newId('egd'),
					exerciseId: input.exerciseId,
					description: input.description,
					cues: cuesJson,
					pitfalls: pitfallsJson,
					updatedAt: now
				})
			}

			return {
				exerciseId: input.exerciseId,
				description: input.description,
				cues: input.cues,
				pitfalls: input.pitfalls,
				updatedAt: now
			}
		}),

	deleteGuide: protectedProcedure
		.meta({ description: 'Delete the technique guide for an exercise you own' })
		.input(z.object({ exerciseId: zodTypeID('exc') }))
		.mutation(async ({ ctx, input }) => {
			const exercise = await ctx.db.query.exercises.findFirst({ where: { id: input.exerciseId } })
			if (!exercise) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' })
			}
			if (exercise.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'System exercise guides are read-only.'
				})
			}
			await ctx.db.delete(exerciseGuides).where(eq(exerciseGuides.exerciseId, input.exerciseId))
		}),

	// ─── Workout Templates ────────────────────────────────────────

	listWorkouts: protectedProcedure.meta({ description: 'List workout templates' }).query(async ({ ctx }) =>
		ctx.db.query.workouts.findMany({
			where: { userId: ctx.user.id },
			with: workoutExercisesWith,
			orderBy: { sortOrder: 'asc' }
		})
	),

	getWorkout: protectedProcedure
		.meta({ description: 'Get workout template with exercises and targets' })
		.input(z.object({ id: zodTypeID('wkt') }))
		.query(async ({ ctx, input }) => {
			const workout = await ctx.db.query.workouts.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				with: workoutExercisesWith
			})
			if (!workout) throw new Error('Workout not found')
			return workout
		}),

	createWorkout: protectedProcedure
		.meta({
			description: 'Create a workout template with exercises, target sets/reps/weight, and optional supersets'
		})
		.input(
			z.object({
				name: z.string().min(1),
				trainingGoal: trainingGoal.default('hypertrophy'),
				exercises: z.array(
					z.object({
						exerciseId: zodTypeID('exc'),
						targetSets: z.number().int().min(1).nullable(),
						targetReps: z.number().int().min(1).nullable(),
						targetWeight: z.number().min(0).nullable(),
						setMode: setMode.default('working'),
						trainingGoal: trainingGoal.nullable().default(null),
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
				// D1 limits to 100 bound params per query (10 cols → max 10 rows per insert)
				for (let i = 0; i < input.exercises.length; i += 10) {
					await ctx.db.insert(workoutExercises).values(
						input.exercises.slice(i, i + 10).map((e, idx) => ({
							workoutId: workout.id,
							exerciseId: e.exerciseId,
							sortOrder: i + idx,
							targetSets: e.targetSets,
							targetReps: e.targetReps,
							targetWeight: e.targetWeight,
							setMode: e.setMode,
							trainingGoal: e.trainingGoal,
							supersetGroup: e.supersetGroup,
							createdAt: now
						}))
					)
				}
			}

			return ctx.db.query.workouts.findFirst({
				where: { id: workout.id },
				with: workoutExercisesWith
			})
		}),

	updateWorkout: protectedProcedure
		.meta({ description: 'Update a workout template (name, goal, exercises, targets, supersets)' })
		.input(
			z.object({
				id: zodTypeID('wkt'),
				name: z.string().min(1).optional(),
				trainingGoal: trainingGoal.optional(),
				sortOrder: z.number().int().min(0).optional(),
				exercises: z
					.array(
						z.object({
							exerciseId: zodTypeID('exc'),
							targetSets: z.number().int().min(1).nullable(),
							targetReps: z.number().int().min(1).nullable(),
							targetWeight: z.number().min(0).nullable(),
							setMode: setMode.default('working'),
							trainingGoal: trainingGoal.nullable().default(null),
							supersetGroup: z.number().int().nullable().default(null)
						})
					)
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.workouts.findFirst({
				where: { id: input.id, userId: ctx.user.id }
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
					for (let i = 0; i < input.exercises.length; i += 10) {
						await ctx.db.insert(workoutExercises).values(
							input.exercises.slice(i, i + 10).map((e, idx) => ({
								workoutId: input.id,
								exerciseId: e.exerciseId,
								sortOrder: i + idx,
								targetSets: e.targetSets,
								targetReps: e.targetReps,
								targetWeight: e.targetWeight,
								setMode: e.setMode,
								trainingGoal: e.trainingGoal,
								supersetGroup: e.supersetGroup,
								createdAt: now
							}))
						)
					}
				}
			}

			return ctx.db.query.workouts.findFirst({
				where: { id: input.id },
				with: workoutExercisesWith
			})
		}),

	reorderWorkouts: protectedProcedure
		.meta({ description: 'Reorder workout templates by providing their IDs in the desired order' })
		.input(z.object({ ids: z.array(zodTypeID('wkt')) }))
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
		.meta({ description: 'Delete a workout template' })
		.input(z.object({ id: zodTypeID('wkt') }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(workouts).where(and(eq(workouts.id, input.id), eq(workouts.userId, ctx.user.id)))
		}),

	// ─── Sessions ─────────────────────────────────────────────────

	listSessions: protectedProcedure
		.meta({ description: 'List workout sessions with dates' })
		.input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
		.query(async ({ ctx, input }) =>
			ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id },
				with: {
					workout: true,
					logs: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { startedAt: 'desc' },
				limit: input?.limit ?? 20
			})
		),

	getSession: protectedProcedure
		.meta({ description: 'Get workout session with logged sets per exercise' })
		.input(z.object({ id: zodTypeID('wks') }))
		.query(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				with: {
					workout: {
						with: workoutExercisesWith
					},
					logs: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: { createdAt: 'asc' }
					},
					plannedExercises: {
						with: { exercise: { with: { muscles: true } } },
						orderBy: { sortOrder: 'asc' }
					}
				}
			})
			if (!session) throw new Error('Session not found')
			return session
		}),

	createSession: protectedProcedure
		.meta({ description: 'Start a new workout session from a template (copies planned exercises as checklist)' })
		.input(z.object({ workoutId: zodTypeID('wkt'), name: z.string().optional() }))
		.mutation(async ({ ctx, input }) => {
			// Verify workout ownership and load template exercises
			const workout = await ctx.db.query.workouts.findFirst({
				where: { id: input.workoutId, userId: ctx.user.id },
				with: { exercises: { orderBy: { sortOrder: 'asc' } } }
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

			// Snapshot template exercises into session planned exercises
			if (workout.exercises.length > 0) {
				for (let i = 0; i < workout.exercises.length; i += 10) {
					await ctx.db.insert(sessionPlannedExercises).values(
						workout.exercises.slice(i, i + 10).map(we => ({
							sessionId: session.id,
							exerciseId: we.exerciseId,
							sortOrder: we.sortOrder,
							targetSets: we.targetSets,
							targetReps: we.targetReps,
							targetWeight: we.targetWeight,
							setMode: we.setMode,
							trainingGoal: we.trainingGoal,
							supersetGroup: we.supersetGroup,
							createdAt: now
						}))
					)
				}
			}

			return session
		}),

	completeSession: protectedProcedure
		.meta({
			description:
				'Complete a workout session and optionally roll actual sets back into the template as new targets'
		})
		.input(
			z.object({
				id: zodTypeID('wks'),
				notes: z.string().optional(),
				templateUpdates: z
					.array(
						z.object({
							exerciseId: zodTypeID('exc'),
							targetSets: z.number().int().min(1).nullable().optional(),
							targetReps: z.number().int().min(1).nullable().optional(),
							targetWeight: z.number().min(0).nullable().optional()
						})
					)
					.optional(),
				addExercises: z
					.array(
						z.object({
							exerciseId: zodTypeID('exc'),
							targetSets: z.number().int().min(1).nullable(),
							targetReps: z.number().int().min(1).nullable(),
							targetWeight: z.number().min(0).nullable(),
							setMode: setMode.default('working')
						})
					)
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: { id: input.id, userId: ctx.user.id }
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
		.meta({ description: 'Delete a workout session' })
		.input(z.object({ id: zodTypeID('wks') }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(workoutSessions)
				.where(and(eq(workoutSessions.id, input.id), eq(workoutSessions.userId, ctx.user.id)))
		}),

	// ─── Set Logging ──────────────────────────────────────────────

	addSet: protectedProcedure
		.meta({
			description: 'Log a set (weight, reps, optional RPE and failure flag) for an exercise in an active session'
		})
		.input(
			z.object({
				sessionId: zodTypeID('wks'),
				exerciseId: zodTypeID('exc'),
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
		.meta({ description: 'Update a logged set (weight, reps, RPE, type, failure flag)' })
		.input(
			z.object({
				id: zodTypeID('wkl'),
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
				where: { id },
				with: { session: true }
			})
			if (!log || log.session.userId !== ctx.user.id) throw new Error('Set not found')

			await ctx.db.update(workoutLogs).set(set).where(eq(workoutLogs.id, id))
		}),

	removeSet: protectedProcedure
		.meta({ description: 'Remove a logged set' })
		.input(z.object({ id: zodTypeID('wkl') }))
		.mutation(async ({ ctx, input }) => {
			const log = await ctx.db.query.workoutLogs.findFirst({
				where: { id: input.id },
				with: { session: true }
			})
			if (!log || log.session.userId !== ctx.user.id) throw new Error('Set not found')
			await ctx.db.delete(workoutLogs).where(eq(workoutLogs.id, input.id))
		}),

	replaceSessionExercise: protectedProcedure
		.meta({ description: 'Swap one exercise for another in an active session (keeps logged sets intact)' })
		.input(
			z.object({
				sessionId: zodTypeID('wks'),
				oldExerciseId: zodTypeID('exc'),
				newExerciseId: zodTypeID('exc')
			})
		)
		.mutation(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: { id: input.sessionId }
			})
			if (!session || session.userId !== ctx.user.id) throw new Error('Session not found')
			await ctx.db
				.update(workoutLogs)
				.set({ exerciseId: input.newExerciseId })
				.where(and(eq(workoutLogs.sessionId, input.sessionId), eq(workoutLogs.exerciseId, input.oldExerciseId)))
			await ctx.db
				.update(sessionPlannedExercises)
				.set({ exerciseId: input.newExerciseId })
				.where(
					and(
						eq(sessionPlannedExercises.sessionId, input.sessionId),
						eq(sessionPlannedExercises.exerciseId, input.oldExerciseId)
					)
				)
		}),

	// ─── Stats ────────────────────────────────────────────────────

	muscleGroupStats: protectedProcedure
		.meta({ description: 'Get volume per muscle group over N days' })
		.input(z.object({ days: z.number().int().min(1).default(7) }).optional())
		.query(async ({ ctx, input }) => {
			const days = input?.days ?? 7
			const since = Date.now() - days * 24 * 60 * 60 * 1000

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: { logs: { with: { exercise: { with: { muscles: true } } } } }
			})

			const contributions: MuscleContribution[] = []
			const lastTrained = new Map<MuscleGroup, number>()
			const sessionCounts = new Map<MuscleGroup, number>()

			for (const session of sessions) {
				const sessionMuscles = new Set<MuscleGroup>()
				for (const log of session.logs) {
					if (log.setType === 'warmup') continue
					for (const m of log.exercise.muscles) {
						contributions.push({
							muscleGroup: m.muscleGroup,
							intensity: m.intensity,
							sets: 1,
							reps: log.reps,
							weightKg: log.weightKg,
							exerciseType: log.exercise.type,
							fatigueTier: log.exercise.fatigueTier,
							trainingGoal: 'hypertrophy'
						})
						sessionMuscles.add(m.muscleGroup)
						if (session.startedAt > (lastTrained.get(m.muscleGroup) ?? 0)) {
							lastTrained.set(m.muscleGroup, session.startedAt)
						}
					}
				}
				for (const mg of sessionMuscles) {
					sessionCounts.set(mg, (sessionCounts.get(mg) ?? 0) + 1)
				}
			}

			const loads = computeMuscleLoad(contributions)
			return loads.map(l => ({
				muscleGroup: l.muscleGroup,
				weeklyVolume: l.volumeKg,
				lastTrained: lastTrained.get(l.muscleGroup) ?? 0,
				sessionCount: sessionCounts.get(l.muscleGroup) ?? 0
			}))
		}),

	/** Coverage stats: weekly sets per muscle assuming all templates are done once */
	coverageStats: protectedProcedure
		.meta({ description: 'Weekly-volume muscle coverage (sets per group assuming each template is done once)' })
		.query(async ({ ctx }) => {
			const userWorkouts = await ctx.db.query.workouts.findMany({
				where: { userId: ctx.user.id },
				with: {
					exercises: {
						with: { exercise: { with: { muscles: true } } }
					}
				},
				orderBy: { sortOrder: 'asc' }
			})

			const contributions: MuscleContribution[] = []
			for (const workout of userWorkouts) {
				for (const we of workout.exercises) {
					const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
					const sets = we.targetSets ?? (goal === 'strength' ? 5 : 3)
					for (const m of we.exercise.muscles) {
						contributions.push({
							muscleGroup: m.muscleGroup,
							intensity: m.intensity,
							sets,
							exerciseType: we.exercise.type,
							fatigueTier: we.exercise.fatigueTier,
							trainingGoal: goal
						})
					}
				}
			}

			return computeMuscleLoad(contributions).map(l => ({
				muscleGroup: l.muscleGroup,
				weeklySets: l.workingSets
			}))
		}),

	// ─── Per-entity Muscle Load ──────────────────────────────────

	exerciseMuscleLoad: protectedProcedure
		.meta({
			description:
				'Per-muscle breakdown for a single exercise at a given dose. Returns effective sets, volume, fatigue load, and compound/primary/goal splits. Omit weightKg/reps for a template-style preview.'
		})
		.input(
			z.object({
				exerciseId: zodTypeID('exc'),
				sets: z.number().int().min(1).default(1),
				reps: z.number().int().min(1).optional(),
				weightKg: z.number().min(0).optional(),
				trainingGoal: trainingGoal.default('hypertrophy')
			})
		)
		.query(async ({ ctx, input }) => {
			const exercise = await ctx.db.query.exercises.findFirst({
				where: {
					id: input.exerciseId,
					OR: [{ userId: { isNull: true } }, { userId: ctx.user.id }]
				},
				with: { muscles: true }
			})
			if (!exercise) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' })

			const contributions: MuscleContribution[] = exercise.muscles.map(m => ({
				muscleGroup: m.muscleGroup,
				intensity: m.intensity,
				sets: input.sets,
				reps: input.reps,
				weightKg: input.weightKg,
				exerciseType: exercise.type,
				fatigueTier: exercise.fatigueTier,
				trainingGoal: input.trainingGoal
			}))

			const muscles = computeMuscleLoad(contributions)
			return {
				exercise: {
					id: exercise.id,
					name: exercise.name,
					type: exercise.type,
					fatigueTier: exercise.fatigueTier
				},
				input: { sets: input.sets, reps: input.reps ?? null, weightKg: input.weightKg ?? null },
				muscles,
				totals: sumTotals(muscles)
			}
		}),

	workoutMuscleLoad: protectedProcedure
		.meta({
			description:
				'Per-muscle weekly-volume breakdown for a workout template (assumes the template is performed once). Includes volume-landmark zones (MEV/MAV/MRV) and common balance ratios.'
		})
		.input(z.object({ workoutId: zodTypeID('wkt') }))
		.query(async ({ ctx, input }) => {
			const workout = await ctx.db.query.workouts.findFirst({
				where: { id: input.workoutId, userId: ctx.user.id },
				with: workoutExercisesWith
			})
			if (!workout) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workout not found' })

			const contributions: MuscleContribution[] = []
			for (const we of workout.exercises) {
				const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
				const sets = we.targetSets ?? (goal === 'strength' ? 5 : 3)
				for (const m of we.exercise.muscles) {
					contributions.push({
						muscleGroup: m.muscleGroup,
						intensity: m.intensity,
						sets,
						reps: we.targetReps ?? undefined,
						weightKg: we.targetWeight ?? undefined,
						exerciseType: we.exercise.type,
						fatigueTier: we.exercise.fatigueTier,
						trainingGoal: goal
					})
				}
			}

			const loads = computeMuscleLoad(contributions)
			const muscles = withZones(loads)
			return {
				workout: {
					id: workout.id,
					name: workout.name,
					trainingGoal: workout.trainingGoal,
					exerciseCount: workout.exercises.length
				},
				muscles,
				totals: sumTotals(loads),
				balances: computeBalances(loads)
			}
		}),

	sessionMuscleLoad: protectedProcedure
		.meta({
			description:
				'Per-muscle breakdown for a logged workout session based on actual working sets (warmups excluded). Includes kg·reps volume, effective sets, splits, and balance ratios.'
		})
		.input(z.object({ sessionId: zodTypeID('wks') }))
		.query(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: { id: input.sessionId, userId: ctx.user.id },
				with: {
					workout: true,
					logs: { with: { exercise: { with: { muscles: true } } } },
					plannedExercises: true
				}
			})
			if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })

			const plannedGoalByExercise = new Map<string, TrainingGoal>()
			for (const pe of session.plannedExercises) {
				if (pe.trainingGoal) plannedGoalByExercise.set(pe.exerciseId, pe.trainingGoal)
			}
			const workoutGoal: TrainingGoal = session.workout?.trainingGoal ?? 'hypertrophy'

			const contributions: MuscleContribution[] = []
			let workingSetCount = 0
			for (const log of session.logs) {
				if (log.setType === 'warmup') continue
				workingSetCount += 1
				const goal = plannedGoalByExercise.get(log.exerciseId) ?? workoutGoal
				for (const m of log.exercise.muscles) {
					contributions.push({
						muscleGroup: m.muscleGroup,
						intensity: m.intensity,
						sets: 1,
						reps: log.reps,
						weightKg: log.weightKg,
						exerciseType: log.exercise.type,
						fatigueTier: log.exercise.fatigueTier,
						trainingGoal: goal
					})
				}
			}

			const muscles = computeMuscleLoad(contributions)
			return {
				session: {
					id: session.id,
					name: session.name,
					startedAt: session.startedAt,
					completedAt: session.completedAt,
					workoutId: session.workoutId,
					trainingGoal: workoutGoal
				},
				workingSetCount,
				muscles,
				totals: sumTotals(muscles),
				balances: computeBalances(muscles)
			}
		}),

	muscleGroupTrend: protectedProcedure
		.meta({
			description:
				'Muscle-group trend: compares the current N-day window against prior windows of the same length. Returns per-muscle current sets/volume, rolling average, and delta percentage.'
		})
		.input(
			z
				.object({
					windowDays: z.number().int().min(1).max(90).default(7),
					lookbackWindows: z.number().int().min(1).max(12).default(4)
				})
				.optional()
		)
		.query(async ({ ctx, input }) => {
			const windowDays = input?.windowDays ?? 7
			const lookbackWindows = input?.lookbackWindows ?? 4
			const now = Date.now()
			const windowMs = windowDays * 24 * 60 * 60 * 1000
			const since = now - windowMs * (lookbackWindows + 1)

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: { logs: { with: { exercise: { with: { muscles: true } } } } }
			})

			type Window = { workingSets: number; volumeKg: number }
			const emptyWindow = (): Window => ({ workingSets: 0, volumeKg: 0 })
			const windowsByMuscle = new Map<MuscleGroup, Window[]>()
			for (const mg of MUSCLE_GROUPS) {
				windowsByMuscle.set(mg, Array.from({ length: lookbackWindows + 1 }, emptyWindow))
			}

			for (const s of sessions) {
				// index 0 = current window (most recent), 1..N = prior windows
				const windowIndex = Math.floor((now - s.startedAt) / windowMs)
				if (windowIndex < 0 || windowIndex > lookbackWindows) continue
				for (const log of s.logs) {
					if (log.setType === 'warmup') continue
					for (const m of log.exercise.muscles) {
						const bucket = windowsByMuscle.get(m.muscleGroup)![windowIndex]
						bucket.workingSets += m.intensity
						bucket.volumeKg += log.weightKg * log.reps * m.intensity
					}
				}
			}

			return Array.from(windowsByMuscle.entries()).map(([muscleGroup, windows]) => {
				const current = windows[0]
				const prior = windows.slice(1)
				const priorAvg: Window = {
					workingSets: prior.reduce((s, w) => s + w.workingSets, 0) / prior.length,
					volumeKg: prior.reduce((s, w) => s + w.volumeKg, 0) / prior.length
				}
				const deltaPct = {
					workingSets:
						priorAvg.workingSets > 0
							? (current.workingSets - priorAvg.workingSets) / priorAvg.workingSets
							: null,
					volumeKg: priorAvg.volumeKg > 0 ? (current.volumeKg - priorAvg.volumeKg) / priorAvg.volumeKg : null
				}
				return { muscleGroup, current, priorAverage: priorAvg, deltaPct }
			})
		}),

	// ─── Generators ───────────────────────────────────────────────

	generateWarmup: protectedProcedure
		.meta({
			description: 'Auto-generate warmup sets (ramp of decreasing reps) for a given working weight and rep target'
		})
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1)
			})
		)
		.query(({ input }) => {
			const { workingWeight } = input
			const bar = 20
			const round = (w: number) => Math.round(w / 0.5) * 0.5

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
				if (sets.length > 0 && sets.at(-1)!.weightKg === w) continue
				const reps = pct <= 0.5 ? 8 : pct <= 0.7 ? 5 : 3
				sets.push({ weightKg: w, reps, setType: 'warmup' })
			}

			return sets
		}),

	generateBackoff: protectedProcedure
		.meta({
			description: 'Auto-generate backoff sets (drop sets with higher reps at reduced weight) for a working set'
		})
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1),
				count: z.number().int().min(1).max(5).default(2)
			})
		)
		.query(({ input }) => {
			const { workingWeight, workingReps, count } = input
			const roundUp = (w: number) => Math.ceil(w / 0.5) * 0.5

			const sets: Array<{ weightKg: number; reps: number; setType: 'backoff' }> = []
			for (let i = 0; i < count; i++) {
				const pct = 0.8 - i * 0.1
				sets.push({
					weightKg: roundUp(workingWeight * pct),
					reps: workingReps + 2 * (i + 1),
					setType: 'backoff'
				})
			}
			return sets
		}),

	importWorkouts: protectedProcedure
		.meta({ description: 'Bulk-import workout templates from tab/CSV text (creates missing exercises on the fly)' })
		.input(z.object({ text: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const allExercises = await ctx.db.query.exercises.findMany({
				where: { OR: [{ userId: { isNull: true } }, { userId: ctx.user.id }] }
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
		.meta({
			description:
				'Bulk-import logged sets from tab/CSV text into a session (creates missing exercises on the fly)'
		})
		.input(
			z.object({
				sessionId: zodTypeID('wks').optional(),
				workoutId: zodTypeID('wkt'),
				text: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Load all available exercises for matching
			const allExercises = await ctx.db.query.exercises.findMany({
				where: { OR: [{ userId: { isNull: true } }, { userId: ctx.user.id }] }
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

	listStandards: protectedProcedure
		.meta({
			description: 'List compound-to-isolation strength ratio standards used to estimate accessory target weights'
		})
		.query(async ({ ctx }) =>
			ctx.db.query.strengthStandards.findMany({
				with: {
					compound: true,
					isolation: true
				}
			})
		)
})
