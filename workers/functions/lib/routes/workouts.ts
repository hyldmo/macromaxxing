import {
	computeBalances,
	computeMuscleLoad,
	type ExerciseType,
	effectiveSetWeightKg,
	estimated1RM,
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
	userSettings,
	WINDOW_CUTOFF_MS,
	withZones,
	workoutExercises,
	workoutLogs,
	workoutProgramItems,
	workoutPrograms,
	workoutSessions,
	workouts,
	zodTypeID
} from '@macromaxxing/db'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'
import type { Database } from '../db'
import { WORKOUT_GUIDE } from '../mcp-instructions'
import { protectedProcedure, publicProcedure, router } from '../trpc'
import { ensureUserSettingsRow } from '../utils'

const CUE_MAX = 300
const DESCRIPTION_MAX = 500
const CUES_MAX_COUNT = 10

/** Highest e1RM across a list of sets; returns 0 for empty/invalid input. */
function pickTopE1rm(sets: ReadonlyArray<{ weightKg: number; reps: number }>): number {
	let best = 0
	for (const s of sets) {
		if (s.weightKg <= 0 || s.reps <= 0) continue
		const e = estimated1RM(s.weightKg, s.reps)
		if (e > best) best = e
	}
	return best
}

/** Collapse added kg + bodyweight multiplier into the stored `workout_logs.weight_kg`. */
async function resolveLogWeightKg(
	db: Database,
	userId: string,
	exerciseId: TypeIDString<'exc'>,
	addedKg: number
): Promise<number> {
	const exercise = await db.query.exercises.findFirst({
		where: { id: exerciseId },
		columns: { bwMultiplier: true }
	})
	if (!exercise || exercise.bwMultiplier <= 0) return addedKg

	const settings = await db.query.userSettings.findFirst({
		where: { userId },
		columns: { weightKg: true }
	})
	const bodyWeightKg = settings?.weightKg ?? null
	if (bodyWeightKg == null || bodyWeightKg <= 0) {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'Set your body weight in Settings before logging bodyweight exercises'
		})
	}
	return effectiveSetWeightKg(exercise.bwMultiplier, bodyWeightKg, addedKg)
}

const zGuideInput = z.object({
	description: z.string().min(10).max(DESCRIPTION_MAX),
	cues: z.array(z.string().min(3).max(CUE_MAX)).min(1).max(CUES_MAX_COUNT),
	pitfalls: z.array(z.string().min(3).max(CUE_MAX)).max(CUES_MAX_COUNT).nullable()
})

const zSetType = z.enum(['warmup', 'working', 'backoff'])

type InferredMuscle = { muscleGroup: MuscleGroup; intensity: number }
type InferredExercise = {
	type: ExerciseType
	fatigueTier: FatigueTier
	muscles: InferredMuscle[]
	bwMultiplier: number
}

/** Keyword-based muscle group inference from exercise name */
function inferExercise(name: string): InferredExercise {
	const n = name.toLowerCase()
	const base = { bwMultiplier: 0 as number }

	// Push-up
	if (/\b(push\s*-?\s*up|press\s*-?\s*up)/i.test(n))
		return {
			...base,
			type: 'compound',
			fatigueTier: 3,
			bwMultiplier: 0.65,
			muscles: [
				{ muscleGroup: 'chest', intensity: 0.8 },
				{ muscleGroup: 'triceps', intensity: 0.5 },
				{ muscleGroup: 'front_delts', intensity: 0.3 }
			]
		}

	// Dip
	if (/\bdip\b/i.test(n))
		return {
			...base,
			type: 'compound',
			fatigueTier: 3,
			bwMultiplier: 1,
			muscles: [
				{ muscleGroup: 'chest', intensity: 0.6 },
				{ muscleGroup: 'triceps', intensity: 0.8 },
				{ muscleGroup: 'front_delts', intensity: 0.4 }
			]
		}

	// Core / abs
	if (/\b(crunch|sit\s*-?up|ab\b|plank|core)/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'core', intensity: 1.0 }] }

	// Calves
	if (/\bcalf|calves/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'calves', intensity: 1.0 }] }

	// Rear delts
	if (/\b(face\s*pull|rear\s*delt|reverse\s*(pec|fly|deck))/i.test(n))
		return {
			...base,
			type: 'isolation',
			fatigueTier: /face\s*pull/i.test(n) ? 3 : 4,
			muscles: [{ muscleGroup: 'rear_delts', intensity: 1.0 }]
		}

	// Lateral raise
	if (/\blateral\s*raise/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'side_delts', intensity: 1.0 }] }

	// Leg curl
	if (/\bleg\s*curl/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'hamstrings', intensity: 1.0 }] }

	// Leg extension
	if (/\bleg\s*ext/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'quads', intensity: 1.0 }] }

	// Tricep isolation (pushdown, extension, kickback)
	if (/\b(pushdown|tricep|skull\s*crush|overhead.*ext)/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'triceps', intensity: 1.0 }] }

	// Bicep isolation (curl variants)
	if (/\b(curl|preacher)/i.test(n)) {
		if (/\bhammer/i.test(n))
			return {
				...base,
				type: 'isolation',
				fatigueTier: 3,
				muscles: [
					{ muscleGroup: 'biceps', intensity: 0.7 },
					{ muscleGroup: 'forearms', intensity: 0.5 }
				]
			}
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'biceps', intensity: 1.0 }] }
	}

	// Chest fly / pec deck
	if (/\b(fly|pec\s*deck|cable\s*cross)/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 3, muscles: [{ muscleGroup: 'chest', intensity: 1.0 }] }

	// Wrist / forearm
	if (/\b(wrist|forearm)/i.test(n))
		return { ...base, type: 'isolation', fatigueTier: 4, muscles: [{ muscleGroup: 'forearms', intensity: 1.0 }] }

	// Shoulder / overhead press (before generic press)
	if (/\b(shoulder|overhead|ohp|military)\b.*press/i.test(n) || /\bpress.*\b(shoulder|overhead)/i.test(n))
		return {
			...base,
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
			...base,
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
			...base,
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
			...base,
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
			...base,
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
			...base,
			type: 'compound',
			fatigueTier: 2,
			bwMultiplier: /\b(pull\s*-?\s*up|chin\s*-?\s*up)\b/i.test(n) ? 1 : 0,
			muscles: [
				{ muscleGroup: 'lats', intensity: 1.0 },
				{ muscleGroup: 'upper_back', intensity: 0.6 },
				{ muscleGroup: 'biceps', intensity: 0.5 }
			]
		}

	// Generic press fallback
	if (/\bpress/i.test(n))
		return {
			...base,
			type: 'compound',
			fatigueTier: 2,
			muscles: [
				{ muscleGroup: 'chest', intensity: 0.8 },
				{ muscleGroup: 'triceps', intensity: 0.5 },
				{ muscleGroup: 'front_delts', intensity: 0.3 }
			]
		}

	// Unknown — default to compound with empty muscles
	return { ...base, type: 'compound', fatigueTier: 2, muscles: [] }
}

/** Throws BAD_REQUEST naming any workoutIds that don't belong to the user */
async function assertWorkoutsOwned(db: Database, userId: string, workoutIds: TypeIDString<'wkt'>[]): Promise<void> {
	if (workoutIds.length === 0) return
	const found = await db
		.select({ id: workouts.id })
		.from(workouts)
		.where(and(inArray(workouts.id, workoutIds), eq(workouts.userId, userId)))
	if (found.length === workoutIds.length) return
	const foundSet = new Set(found.map(r => r.id))
	const missing = workoutIds.filter(id => !foundSet.has(id))
	throw new TRPCError({
		code: 'BAD_REQUEST',
		message: `Workouts not found or not owned: ${missing.join(', ')}`
	})
}

/** Insert program items in 20-row chunks (D1 100-bound-param limit, 5 cols) */
async function insertProgramItems(
	db: Database,
	programId: TypeIDString<'wpr'>,
	workoutIds: TypeIDString<'wkt'>[],
	now: number
): Promise<void> {
	const CHUNK = 20
	for (let i = 0; i < workoutIds.length; i += CHUNK) {
		const slice = workoutIds.slice(i, i + CHUNK)
		await db.insert(workoutProgramItems).values(
			slice.map((workoutId, idx) => ({
				programId,
				workoutId,
				sortOrder: i + idx,
				createdAt: now
			}))
		)
	}
}

async function getProgramOrThrow(db: Database, userId: string, id: TypeIDString<'wpr'>) {
	const program = await db.query.workoutPrograms.findFirst({
		where: { id, userId },
		with: { items: { orderBy: { sortOrder: 'asc' }, with: { workout: true } } }
	})
	if (!program) {
		throw new TRPCError({ code: 'NOT_FOUND', message: `Program ${id} not found or not owned by current user` })
	}
	return {
		id: program.id,
		name: program.name,
		sortOrder: program.sortOrder,
		createdAt: program.createdAt,
		updatedAt: program.updatedAt,
		workouts: program.items.map(i => i.workout)
	}
}

/** Shared `with` for workout template queries */
const workoutExercisesWith = {
	exercises: {
		with: { exercise: { with: { muscles: true } } },
		orderBy: { sortOrder: 'asc' as const }
	}
} as const

export const workoutsRouter = router({
	// ─── Orientation ──────────────────────────────────────────────

	guide: publicProcedure
		.meta({
			description:
				'Full conventions reference for training program design: fatigue tiers, rep ranges, muscle-intensity scale, volume landmarks (MEV/MAV/MRV), movement-family classification, home/gym programming, bodyweight exercise logging (bwMultiplier), and muscle-load tool gotchas. Call with no arguments before designing or modifying exercises, templates, or programs.'
		})
		.query(() => WORKOUT_GUIDE),

	// ─── Exercise CRUD ────────────────────────────────────────────

	listExercises: protectedProcedure
		.meta({
			description:
				'List available exercises (system catalog + user-created) with muscle mappings and bwMultiplier (0 = absolute load, >0 = bodyweight fraction)'
		})
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
		.meta({
			description:
				'Create a custom exercise with muscle group intensities, training rep ranges, bwMultiplier (0 = absolute kg; >0 = bodyweight — weight fields are added kg only), and optional technique guide'
		})
		// TODO: collapse to drizzle-zod once https://github.com/drizzle-team/drizzle-orm/pull/5192 lands
		.input(
			z.object({
				name: z.string().min(1),
				type: exerciseType,
				fatigueTier: z.number().int().min(1).max(4).optional(),
				muscles: z.array(z.object({ muscleGroup: z.enum(MUSCLE_GROUPS), intensity: z.number().min(0).max(1) })),
				strengthRepsMin: z.number().int().min(1).nullable(),
				strengthRepsMax: z.number().int().min(1).nullable(),
				hypertrophyRepsMin: z.number().int().min(1).nullable(),
				hypertrophyRepsMax: z.number().int().min(1).nullable(),
				bwMultiplier: z.number().min(0).max(2).optional(),
				guide: zGuideInput.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			const tier = (input.fatigueTier ?? (input.type === 'compound' ? 2 : 4)) as FatigueTier
			const { muscles, guide, ...exerciseFields } = input
			const [exercise] = await ctx.db
				.insert(exercises)
				.values({ ...exerciseFields, userId: ctx.user.id, fatigueTier: tier, createdAt: now })
				.returning()

			if (muscles.length > 0) {
				await ctx.db.insert(exerciseMuscles).values(
					muscles.map(m => ({
						exerciseId: exercise.id,
						muscleGroup: m.muscleGroup,
						intensity: m.intensity
					}))
				)
			}

			if (guide) {
				await ctx.db.insert(exerciseGuides).values({
					id: newId('egd'),
					exerciseId: exercise.id,
					description: guide.description,
					cues: JSON.stringify(guide.cues),
					pitfalls: guide.pitfalls === null ? null : JSON.stringify(guide.pitfalls),
					updatedAt: now
				})
			}

			return ctx.db.query.exercises.findFirst({
				where: { id: exercise.id },
				with: { muscles: true, guide: true }
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
				bwMultiplier: z.number().min(0).max(2).optional(),
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
			if (fields.bwMultiplier !== undefined) set.bwMultiplier = fields.bwMultiplier

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
						supersetGroup: z.number().int().nullable().default(null),
						note: z.string().nullable().default(null)
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
				// D1 limits to 100 bound params per query (11 cols → max 9 rows per insert)
				for (let i = 0; i < input.exercises.length; i += 9) {
					await ctx.db.insert(workoutExercises).values(
						input.exercises.slice(i, i + 9).map((e, idx) => ({
							workoutId: workout.id,
							exerciseId: e.exerciseId,
							sortOrder: i + idx,
							targetSets: e.targetSets,
							targetReps: e.targetReps,
							targetWeight: e.targetWeight,
							setMode: e.setMode,
							trainingGoal: e.trainingGoal,
							supersetGroup: e.supersetGroup,
							note: e.note,
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
							supersetGroup: z.number().int().nullable().default(null),
							note: z.string().nullable().default(null)
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
					for (let i = 0; i < input.exercises.length; i += 9) {
						await ctx.db.insert(workoutExercises).values(
							input.exercises.slice(i, i + 9).map((e, idx) => ({
								workoutId: input.id,
								exerciseId: e.exerciseId,
								sortOrder: i + idx,
								targetSets: e.targetSets,
								targetReps: e.targetReps,
								targetWeight: e.targetWeight,
								setMode: e.setMode,
								trainingGoal: e.trainingGoal,
								supersetGroup: e.supersetGroup,
								note: e.note,
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

			// Use the last logged set's timestamp so a forgotten "complete" tap
			// doesn't inflate the session duration. Fall back to now when nothing
			// was logged (or the last log predates session start).
			const [lastLog] = await ctx.db
				.select({ lastLoggedAt: sql<number | null>`max(${workoutLogs.createdAt})` })
				.from(workoutLogs)
				.where(eq(workoutLogs.sessionId, input.id))
			const lastLoggedAt = lastLog?.lastLoggedAt ?? null
			const completedAt = lastLoggedAt !== null && lastLoggedAt >= session.startedAt ? lastLoggedAt : Date.now()

			await ctx.db
				.update(workoutSessions)
				.set({
					completedAt,
					...(input.notes !== undefined ? { notes: input.notes } : {})
				})
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

	updateSessionNotes: protectedProcedure
		.meta({ description: 'Update notes on a workout session (in-progress or completed)' })
		.input(z.object({ id: zodTypeID('wks'), notes: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				columns: { id: true }
			})
			if (!session) throw new Error('Session not found')

			await ctx.db.update(workoutSessions).set({ notes: input.notes }).where(eq(workoutSessions.id, input.id))
		}),

	deleteSession: protectedProcedure
		.meta({ description: 'Delete a workout session' })
		.input(z.object({ id: zodTypeID('wks') }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(workoutSessions)
				.where(and(eq(workoutSessions.id, input.id), eq(workoutSessions.userId, ctx.user.id)))
		}),

	// ─── "Last time" lookups (UI hot path) ───────────────────────
	//
	// These endpoints power the "last time you did X: 80×6, 80×6, 75×8" hint
	// on each exercise row in a session. They are intentionally NOT exposed as
	// MCP tools (no `.meta`) — they are pure UI primitives.
	//
	// Note on `replaceSessionExercise`: that mutation rewrites historical
	// `workout_logs.exerciseId` in place, so these lookups automatically reflect
	// the post-replace state. That is the intended behavior.
	//
	// Note on supersets: returned `workingSets` are ALL working sets for the
	// exercise from that session, in insertion order. Round-by-round superset
	// rendering is the caller's responsibility.

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	lastSessionForExercise: protectedProcedure
		.input(
			z.object({
				exerciseId: zodTypeID('exc'),
				/** unix epoch ms; if set, return last session strictly before this timestamp */
				before: z.number().int().positive().optional()
			})
		)
		.query(async ({ ctx, input }) => {
			const session = await ctx.db.query.workoutSessions.findFirst({
				where: {
					userId: ctx.user.id,
					...(input.before !== undefined ? { startedAt: { lt: input.before } } : {}),
					// Restrict to sessions that have at least one WORKING set for this exercise.
					// Subquery is tenant-safe because the outer `userId` filter still applies.
					RAW: t =>
						inArray(
							t.id,
							ctx.db
								.select({ id: workoutLogs.sessionId })
								.from(workoutLogs)
								.where(
									and(
										eq(workoutLogs.exerciseId, input.exerciseId),
										eq(workoutLogs.setType, 'working')
									)
								)
						)
				},
				with: {
					logs: {
						where: { exerciseId: input.exerciseId, setType: 'working' },
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { startedAt: 'desc' }
			})

			if (!session || session.logs.length === 0) return null

			const workingSets = session.logs.map(l => ({
				weightKg: l.weightKg,
				reps: l.reps,
				rpe: l.rpe
			}))

			return {
				sessionId: session.id,
				startedAt: session.startedAt,
				workingSets,
				// `topE1rm: 0` for bodyweight-only sessions (every set has weightKg <= 0).
				// Callers should fall back to reps/recency in that case (see metricHierarchy).
				topE1rm: pickTopE1rm(workingSets)
			}
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// One JOIN'd query per chunk of exercise IDs; in-memory group-by picks the
	// latest session per exerciseId. D1 has no window functions, so this is the
	// correct shape (confirmed: in-memory grouping is required).
	lastSessionsForExercises: protectedProcedure
		.input(
			z.object({
				exerciseIds: z.array(zodTypeID('exc')).min(1).max(100),
				/** unix epoch ms; if set, return last session strictly before this timestamp */
				before: z.number().int().positive().optional()
			})
		)
		.query(async ({ ctx, input }) => {
			type ExerciseId = TypeIDString<'exc'>
			type SessionId = TypeIDString<'wks'>
			type WorkingSet = { weightKg: number; reps: number; rpe: number | null }
			type Result = { sessionId: SessionId; startedAt: number; workingSets: WorkingSet[]; topE1rm: number }

			// D1 has a 100-bound-param limit per statement. With 100 IDs + userId + before,
			// we'd hit it. Chunk to 96 IDs to leave headroom for the constant filters.
			const CHUNK = 96
			const uniqueIds = [...new Set(input.exerciseIds)]

			type Row = {
				sessionId: SessionId
				startedAt: number
				exerciseId: ExerciseId
				weightKg: number
				reps: number
				rpe: number | null
			}
			const rows: Row[] = []

			for (let i = 0; i < uniqueIds.length; i += CHUNK) {
				const slice = uniqueIds.slice(i, i + CHUNK)
				const chunkRows = await ctx.db
					.select({
						sessionId: workoutLogs.sessionId,
						startedAt: workoutSessions.startedAt,
						exerciseId: workoutLogs.exerciseId,
						weightKg: workoutLogs.weightKg,
						reps: workoutLogs.reps,
						rpe: workoutLogs.rpe
					})
					.from(workoutLogs)
					.innerJoin(workoutSessions, eq(workoutLogs.sessionId, workoutSessions.id))
					.where(
						and(
							eq(workoutSessions.userId, ctx.user.id),
							inArray(workoutLogs.exerciseId, slice),
							eq(workoutLogs.setType, 'working'),
							...(input.before !== undefined ? [sql`${workoutSessions.startedAt} < ${input.before}`] : [])
						)
					)
				rows.push(...chunkRows)
			}

			// Group by exerciseId, then within each group pick the session with the
			// latest startedAt and collect all its working sets.
			const byExercise = new Map<ExerciseId, Map<SessionId, { startedAt: number; sets: WorkingSet[] }>>()
			for (const row of rows) {
				let perEx = byExercise.get(row.exerciseId)
				if (!perEx) {
					perEx = new Map()
					byExercise.set(row.exerciseId, perEx)
				}
				let sess = perEx.get(row.sessionId)
				if (!sess) {
					sess = { startedAt: row.startedAt, sets: [] }
					perEx.set(row.sessionId, sess)
				}
				sess.sets.push({ weightKg: row.weightKg, reps: row.reps, rpe: row.rpe })
			}

			const out: Record<ExerciseId, Result | null> = {}
			for (const exerciseId of input.exerciseIds) {
				const perEx = byExercise.get(exerciseId)
				if (!perEx || perEx.size === 0) {
					out[exerciseId] = null
					continue
				}
				let bestId: SessionId | null = null
				let bestStartedAt = -Infinity
				for (const [sid, s] of perEx) {
					if (s.startedAt > bestStartedAt) {
						bestStartedAt = s.startedAt
						bestId = sid
					}
				}
				if (!bestId) {
					out[exerciseId] = null
					continue
				}
				const winner = perEx.get(bestId)!
				out[exerciseId] = {
					sessionId: bestId,
					startedAt: winner.startedAt,
					workingSets: winner.sets,
					// `topE1rm: 0` for bodyweight-only sessions; callers fall back to reps/recency.
					topE1rm: pickTopE1rm(winner.sets)
				}
			}
			return out
		}),

	// Tenant-scoped via workout_sessions.userId — never drive query FROM workout_logs.
	// Returns one point per session (oldest → newest), so callers can plot a
	// time series of weight, e1RM, and volume for a single exercise.
	exerciseHistory: protectedProcedure
		.meta({
			description: 'Per-exercise workout history time series: weight, e1RM, volume per session over a time window'
		})
		.input(
			z.object({
				exerciseId: zodTypeID('exc'),
				window: z.enum(['4w', '12w', '1y']).default('12w')
			})
		)
		.query(async ({ ctx, input }) => {
			const cutoffMs = WINDOW_CUTOFF_MS[input.window]
			const since = Date.now() - cutoffMs

			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: { userId: ctx.user.id, startedAt: { gte: since } },
				with: {
					logs: {
						where: { exerciseId: input.exerciseId, setType: 'working' },
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { startedAt: 'asc' }
			})

			const out: Array<{
				sessionId: TypeIDString<'wks'>
				startedAt: number
				topSet: { weightKg: number; reps: number; rpe: number | null }
				e1rm: number
				volume: number
				workingSetCount: number
			}> = []

			for (const session of sessions) {
				if (session.logs.length === 0) continue

				// Seed e1RM tracking from 0 and only consider valid sets (weight > 0 AND reps > 0).
				// Seeding from the first log would be wrong: estimated1RM(W, 0) === W, so a 0-rep
				// first set would inflate topE1rm to W and shadow any real working set with a
				// genuinely lower e1RM. Mirrors the pattern in `pickTopE1rm`.
				let topSet: (typeof session.logs)[number] | null = null
				let topE1rm = 0
				let volume = 0
				let weightedCount = 0

				for (const log of session.logs) {
					volume += log.weightKg * log.reps
					// Skip invalid sets for e1RM but still count them for volume/setCount.
					if (log.weightKg <= 0 || log.reps <= 0) continue
					weightedCount += 1
					const e = estimated1RM(log.weightKg, log.reps)
					if (e > topE1rm) {
						topE1rm = e
						topSet = log
					}
				}

				// `e1rm: 0` for bodyweight-only sessions (no set with both weight > 0 and reps > 0).
				// `topSet` falls back to the first logged set so callers still get a record of what was logged.
				const fallback = topSet ?? session.logs[0]
				out.push({
					sessionId: session.id,
					startedAt: session.startedAt,
					topSet: { weightKg: fallback.weightKg, reps: fallback.reps, rpe: fallback.rpe },
					e1rm: weightedCount > 0 ? topE1rm : 0,
					volume,
					workingSetCount: session.logs.length
				})
			}

			return out
		}),

	// ─── Set Logging ──────────────────────────────────────────────

	addSet: protectedProcedure
		.meta({
			description:
				'Log a set for an exercise in an active session. weightKg is absolute load for barbell exercises (bwMultiplier 0); for bodyweight exercises it is added kg only — server stores effective load (user bodyWeight × bwMultiplier + added). Requires user weightKg in settings for BW exercises.'
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

			const weightKg = await resolveLogWeightKg(ctx.db, ctx.user.id, input.exerciseId, input.weightKg)

			const [log] = await ctx.db
				.insert(workoutLogs)
				.values({
					sessionId: input.sessionId,
					exerciseId: input.exerciseId,
					setNumber,
					setType: input.setType,
					weightKg,
					reps: input.reps,
					rpe: input.rpe ?? null,
					failureFlag: input.failureFlag,
					createdAt: Date.now()
				})
				.returning()
			return log
		}),

	updateSet: protectedProcedure
		.meta({
			description:
				'Update a logged set (weight, reps, RPE, type, failure flag). weightKg follows the same added-vs-absolute rule as workout_addSet; stored logs always hold effective kg.'
		})
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

			// Verify ownership via session
			const log = await ctx.db.query.workoutLogs.findFirst({
				where: { id },
				with: { session: true }
			})
			if (!log || log.session.userId !== ctx.user.id) throw new Error('Set not found')

			if (updates.weightKg !== undefined) {
				set.weightKg = await resolveLogWeightKg(ctx.db, ctx.user.id, log.exerciseId, updates.weightKg)
			}
			if (updates.reps !== undefined) set.reps = updates.reps
			if (updates.setType !== undefined) set.setType = updates.setType
			if (updates.rpe !== undefined) set.rpe = updates.rpe
			if (updates.failureFlag !== undefined) set.failureFlag = updates.failureFlag ? 1 : 0
			if (Object.keys(set).length === 0) return log

			const [updated] = await ctx.db.update(workoutLogs).set(set).where(eq(workoutLogs.id, id)).returning()
			return updated
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

	exercisesByMuscleGroup: protectedProcedure
		.meta({
			description:
				'List exercises (system catalog + user-created) that train a given muscle group, sorted by that muscle’s intensity (highest first). Optionally filter by exercise type.'
		})
		.input(z.object({ muscleGroup: z.enum(MUSCLE_GROUPS), type: exerciseType.optional() }))
		.query(async ({ ctx, input }) => {
			const typeFilter = input.type ? { type: input.type } : {}
			const all = await ctx.db.query.exercises.findMany({
				where: {
					OR: [{ userId: { isNull: true } }, { userId: ctx.user.id }],
					...typeFilter
				},
				with: { muscles: true },
				orderBy: { name: 'asc' }
			})

			return all
				.flatMap(exercise => {
					const match = exercise.muscles.find(m => m.muscleGroup === input.muscleGroup)
					return match ? [{ ...exercise, intensity: match.intensity }] : []
				})
				.sort((a, b) => b.intensity - a.intensity || a.name.localeCompare(b.name))
		}),

	sessionsByMuscleGroup: protectedProcedure
		.meta({
			description:
				'Logged sessions that trained a given muscle group (working sets only), most recent first. Each session lists the contributing exercises with their working-set count plus the muscle’s effective sets and kg·reps volume for that session.'
		})
		.input(
			z.object({
				muscleGroup: z.enum(MUSCLE_GROUPS),
				days: z.number().int().min(1).optional(),
				limit: z.number().int().min(1).max(100).default(50)
			})
		)
		.query(async ({ ctx, input }) => {
			const sessions = await ctx.db.query.workoutSessions.findMany({
				where: {
					userId: ctx.user.id,
					...(input.days ? { startedAt: { gte: Date.now() - input.days * 24 * 60 * 60 * 1000 } } : {})
				},
				with: { workout: true, logs: { with: { exercise: { with: { muscles: true } } } } },
				orderBy: { startedAt: 'desc' }
			})

			type ExerciseHit = {
				exerciseId: (typeof sessions)[number]['logs'][number]['exerciseId']
				name: string
				type: ExerciseType
				intensity: number
				workingSets: number
			}

			const results = []
			for (const session of sessions) {
				const hits = new Map<string, ExerciseHit>()
				const contributions: MuscleContribution[] = []
				for (const log of session.logs) {
					if (log.setType === 'warmup') continue
					const m = log.exercise.muscles.find(mm => mm.muscleGroup === input.muscleGroup)
					if (!m) continue
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
					const existing = hits.get(log.exerciseId)
					if (existing) existing.workingSets += 1
					else
						hits.set(log.exerciseId, {
							exerciseId: log.exerciseId,
							name: log.exercise.name,
							type: log.exercise.type,
							intensity: m.intensity,
							workingSets: 1
						})
				}
				if (hits.size === 0) continue

				const load = computeMuscleLoad(contributions).find(l => l.muscleGroup === input.muscleGroup)
				results.push({
					session: {
						id: session.id,
						name: session.name,
						startedAt: session.startedAt,
						completedAt: session.completedAt,
						workoutId: session.workoutId,
						workoutName: session.workout?.name ?? null
					},
					exercises: Array.from(hits.values()).sort((a, b) => b.workingSets - a.workingSets),
					effectiveSets: load?.workingSets ?? 0,
					volumeKg: load?.volumeKg ?? 0
				})
				if (results.length >= input.limit) break
			}

			return results
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

			const settings = await ctx.db.query.userSettings.findFirst({
				where: { userId: ctx.user.id },
				columns: { weightKg: true }
			})
			const bodyWeightKg = settings?.weightKg ?? null

			const contributions: MuscleContribution[] = []
			for (const we of workout.exercises) {
				const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
				const sets = we.targetSets ?? (goal === 'strength' ? 5 : 3)
				const targetWeight = we.targetWeight
				const weightKg =
					targetWeight != null
						? effectiveSetWeightKg(we.exercise.bwMultiplier, bodyWeightKg, targetWeight)
						: undefined
				for (const m of we.exercise.muscles) {
					contributions.push({
						muscleGroup: m.muscleGroup,
						intensity: m.intensity,
						sets,
						reps: we.targetReps ?? undefined,
						weightKg,
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
			description:
				'Auto-generate warmup sets. Working weight is added kg; bodyweight exercises (exerciseId with bwMultiplier > 0) get rep-based warmups at +0.'
		})
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1),
				exerciseId: zodTypeID('exc').optional()
			})
		)
		.query(async ({ ctx, input }) => {
			let bwMultiplier = 0
			if (input.exerciseId) {
				const exercise = await ctx.db.query.exercises.findFirst({
					where: { id: input.exerciseId },
					columns: { bwMultiplier: true }
				})
				bwMultiplier = exercise?.bwMultiplier ?? 0
			}

			if (bwMultiplier > 0) {
				const sets: Array<{ weightKg: number; reps: number; setType: 'warmup' }> = []
				const firstReps = Math.max(3, Math.round(input.workingReps * 0.6))
				sets.push({ weightKg: 0, reps: firstReps, setType: 'warmup' })
				const secondReps = Math.max(2, Math.round(input.workingReps * 0.4))
				if (secondReps < firstReps) {
					sets.push({ weightKg: 0, reps: secondReps, setType: 'warmup' })
				}
				return sets
			}

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
			description:
				'Auto-generate backoff sets. Working weight is added kg; bodyweight exercises (exerciseId with bwMultiplier > 0) get +0 backoff sets with extra reps.'
		})
		.input(
			z.object({
				workingWeight: z.number().min(0),
				workingReps: z.number().int().min(1),
				count: z.number().int().min(1).max(5).default(2),
				exerciseId: zodTypeID('exc').optional()
			})
		)
		.query(async ({ ctx, input }) => {
			let bwMultiplier = 0
			if (input.exerciseId) {
				const exercise = await ctx.db.query.exercises.findFirst({
					where: { id: input.exerciseId },
					columns: { bwMultiplier: true }
				})
				bwMultiplier = exercise?.bwMultiplier ?? 0
			}

			const { workingWeight, workingReps, count } = input

			if (bwMultiplier > 0) {
				const sets: Array<{ weightKg: number; reps: number; setType: 'backoff' }> = []
				for (let i = 0; i < count; i++) {
					sets.push({
						weightKg: 0,
						reps: workingReps + 2 * (i + 1),
						setType: 'backoff'
					})
				}
				return sets
			}

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
								bwMultiplier: inferred.bwMultiplier,
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
				'Bulk-import logged sets from tab/CSV text into a session (creates missing exercises on the fly). Imported weights are treated as added kg and expanded to effective load for bodyweight exercises.'
		})
		.input(
			z.object({
				sessionId: zodTypeID('wks').optional(),
				workoutId: zodTypeID('wkt'),
				text: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const settings = await ctx.db.query.userSettings.findFirst({
				where: { userId: ctx.user.id },
				columns: { weightKg: true }
			})
			const bodyWeightKg = settings?.weightKg ?? null

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

			// Fail fast if any imported row targets a BW exercise without body weight set
			for (const parsed of sessions) {
				for (const row of parsed.rows) {
					const cached = exerciseCache.get(row.exerciseName.toLowerCase())
					const bwMultiplier = cached?.bwMultiplier ?? inferExercise(row.exerciseName).bwMultiplier
					if (bwMultiplier > 0 && (bodyWeightKg == null || bodyWeightKg <= 0)) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'Set your body weight in Settings before logging bodyweight exercises'
						})
					}
				}
			}

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
					failureFlag: boolean
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
								bwMultiplier: inferred.bwMultiplier,
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
							weightKg: effectiveSetWeightKg(exercise.bwMultiplier, bodyWeightKg, row.weightKg),
							reps: row.reps,
							rpe: null,
							failureFlag: false,
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

	// ─── Workout Programs ─────────────────────────────────────────

	listPrograms: protectedProcedure
		.meta({
			description:
				"List the user's workout programs (named ordered groupings of workout templates), each with its embedded workouts in cycle order"
		})
		.query(async ({ ctx }) => {
			const programs = await ctx.db.query.workoutPrograms.findMany({
				where: { userId: ctx.user.id },
				with: {
					items: {
						orderBy: { sortOrder: 'asc' },
						with: { workout: true }
					}
				},
				orderBy: { sortOrder: 'asc' }
			})
			return programs.map(p => ({
				id: p.id,
				name: p.name,
				sortOrder: p.sortOrder,
				createdAt: p.createdAt,
				updatedAt: p.updatedAt,
				workouts: p.items.map(i => i.workout)
			}))
		}),

	getProgram: protectedProcedure
		.meta({ description: 'Get a workout program by ID with its ordered list of workout templates' })
		.input(z.object({ id: zodTypeID('wpr') }))
		.query(async ({ ctx, input }) => {
			const program = await ctx.db.query.workoutPrograms.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				with: {
					items: {
						orderBy: { sortOrder: 'asc' },
						with: { workout: true }
					}
				}
			})
			if (!program) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Program ${input.id} not found or not owned by current user`
				})
			}
			return {
				id: program.id,
				name: program.name,
				sortOrder: program.sortOrder,
				createdAt: program.createdAt,
				updatedAt: program.updatedAt,
				workouts: program.items.map(i => i.workout)
			}
		}),

	createProgram: protectedProcedure
		.meta({
			description:
				'Create a named workout program from an ordered list of workout template IDs (cycle order = array order). All workoutIds must be owned by the user; duplicates rejected. Program name must be unique per user'
		})
		.input(
			z.object({
				name: z.string().min(1).max(100),
				workoutIds: z
					.array(zodTypeID('wkt'))
					.refine(ids => new Set(ids).size === ids.length, { message: 'workoutIds contains duplicates' })
			})
		)
		.mutation(async ({ ctx, input }) => {
			await assertWorkoutsOwned(ctx.db, ctx.user.id, input.workoutIds)

			const now = Date.now()
			const existingCount = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(workoutPrograms)
				.where(eq(workoutPrograms.userId, ctx.user.id))
			const sortOrder = existingCount[0]?.count ?? 0

			let program: { id: TypeIDString<'wpr'> }
			try {
				const [created] = await ctx.db
					.insert(workoutPrograms)
					.values({ userId: ctx.user.id, name: input.name, sortOrder, createdAt: now, updatedAt: now })
					.returning({ id: workoutPrograms.id })
				program = created
			} catch (err) {
				if (err instanceof Error && /UNIQUE/.test(err.message)) {
					// biome-ignore lint/nursery/useErrorCause: TRPCError takes cause inside its options object
					throw new TRPCError({
						code: 'CONFLICT',
						message: `A program with the name "${input.name}" already exists`,
						cause: err
					})
				}
				throw err
			}

			if (input.workoutIds.length > 0) {
				await insertProgramItems(ctx.db, program.id, input.workoutIds, now)
			}
			return getProgramOrThrow(ctx.db, ctx.user.id, program.id)
		}),

	updateProgram: protectedProcedure
		.meta({
			description:
				"Update a program's name and/or replace its full ordered list of workout template IDs (atomic replace, not patch)"
		})
		.input(
			z.object({
				id: zodTypeID('wpr'),
				name: z.string().min(1).max(100).optional(),
				workoutIds: z
					.array(zodTypeID('wkt'))
					.refine(ids => new Set(ids).size === ids.length, { message: 'workoutIds contains duplicates' })
					.optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const existing = await ctx.db.query.workoutPrograms.findFirst({
				where: { id: input.id, userId: ctx.user.id },
				columns: { id: true }
			})
			if (!existing) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Program ${input.id} not found or not owned by current user`
				})
			}

			if (input.workoutIds !== undefined) {
				await assertWorkoutsOwned(ctx.db, ctx.user.id, input.workoutIds)
			}

			const now = Date.now()
			const set: Record<string, unknown> = { updatedAt: now }
			if (input.name !== undefined) set.name = input.name

			try {
				if (input.workoutIds !== undefined) {
					// Atomic replace: delete all items + chunked inserts + name update in a single batch
					const CHUNK = 20 // 5 cols × 20 rows = 100 bound params (D1 limit)
					const stmts: BatchItem<'sqlite'>[] = [
						ctx.db.delete(workoutProgramItems).where(eq(workoutProgramItems.programId, input.id))
					]
					for (let i = 0; i < input.workoutIds.length; i += CHUNK) {
						const chunk = input.workoutIds.slice(i, i + CHUNK)
						stmts.push(
							ctx.db.insert(workoutProgramItems).values(
								chunk.map((workoutId, idx) => ({
									programId: input.id,
									workoutId,
									sortOrder: i + idx,
									createdAt: now
								}))
							)
						)
					}
					stmts.push(ctx.db.update(workoutPrograms).set(set).where(eq(workoutPrograms.id, input.id)))
					await ctx.db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
				} else {
					await ctx.db.update(workoutPrograms).set(set).where(eq(workoutPrograms.id, input.id))
				}
			} catch (err) {
				if (err instanceof Error && /UNIQUE/.test(err.message)) {
					// biome-ignore lint/nursery/useErrorCause: TRPCError takes cause inside its options object
					throw new TRPCError({
						code: 'CONFLICT',
						message: `A program with the name "${input.name}" already exists`,
						cause: err
					})
				}
				throw err
			}

			return getProgramOrThrow(ctx.db, ctx.user.id, input.id)
		}),

	deleteProgram: protectedProcedure
		.meta({
			description:
				'Delete a workout program. If it was the active program, the user falls back to legacy "cycle all templates" behavior'
		})
		.input(z.object({ id: zodTypeID('wpr') }))
		.mutation(async ({ ctx, input }) => {
			const result = await ctx.db
				.delete(workoutPrograms)
				.where(and(eq(workoutPrograms.id, input.id), eq(workoutPrograms.userId, ctx.user.id)))
				.returning({ id: workoutPrograms.id })
			if (result.length === 0) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Program ${input.id} not found or not owned by current user`
				})
			}
		}),

	setActiveProgram: protectedProcedure
		.meta({
			description:
				'Set the user\'s active workout program (drives Dashboard "Up next" cycling). Pass null to clear and revert to legacy behavior. Idempotent — safe to retry'
		})
		.input(z.object({ id: zodTypeID('wpr').nullable() }))
		.mutation(async ({ ctx, input }) => {
			let program: { id: TypeIDString<'wpr'>; name: string } | null = null
			if (input.id !== null) {
				const found = await ctx.db.query.workoutPrograms.findFirst({
					where: { id: input.id, userId: ctx.user.id },
					columns: { id: true, name: true }
				})
				if (!found) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: `Program ${input.id} not found or not owned by current user`
					})
				}
				program = found
			}

			await ensureUserSettingsRow(ctx.db, ctx.user.id)
			await ctx.db
				.update(userSettings)
				.set({ activeProgramId: program?.id ?? null })
				.where(eq(userSettings.userId, ctx.user.id))

			return { activeProgramId: program?.id ?? null, activeProgramName: program?.name ?? null }
		}),

	reorderPrograms: protectedProcedure
		.meta({ description: 'Reorder workout programs by providing their IDs in the desired order' })
		.input(z.object({ ids: z.array(zodTypeID('wpr')) }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			for (let i = 0; i < input.ids.length; i++) {
				await ctx.db
					.update(workoutPrograms)
					.set({ sortOrder: i, updatedAt: now })
					.where(and(eq(workoutPrograms.id, input.ids[i]), eq(workoutPrograms.userId, ctx.user.id)))
			}
		}),

	programMuscleLoad: protectedProcedure
		.meta({
			description:
				'Per-muscle breakdown for a workout program — aggregates sets across every workout in the cycle (assumes one full cycle is performed). Returns volume-landmark zones (MEV/MAV/MRV), totals, balance ratios, and the list of muscles falling below MEV.'
		})
		.input(z.object({ programId: zodTypeID('wpr') }))
		.query(async ({ ctx, input }) => {
			const program = await ctx.db.query.workoutPrograms.findFirst({
				where: { id: input.programId, userId: ctx.user.id },
				with: {
					items: {
						orderBy: { sortOrder: 'asc' },
						with: { workout: { with: workoutExercisesWith } }
					}
				}
			})
			if (!program) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Program ${input.programId} not found or not owned by current user`
				})
			}

			const settings = await ctx.db.query.userSettings.findFirst({
				where: { userId: ctx.user.id },
				columns: { weightKg: true }
			})
			const bodyWeightKg = settings?.weightKg ?? null

			const contributions: MuscleContribution[] = []
			let exerciseCount = 0
			for (const item of program.items) {
				const workout = item.workout
				for (const we of workout.exercises) {
					exerciseCount++
					const goal: TrainingGoal = we.trainingGoal ?? workout.trainingGoal
					const sets = we.targetSets ?? (goal === 'strength' ? 5 : 3)
					const targetWeight = we.targetWeight
					const weightKg =
						targetWeight != null
							? effectiveSetWeightKg(we.exercise.bwMultiplier, bodyWeightKg, targetWeight)
							: undefined
					for (const m of we.exercise.muscles) {
						contributions.push({
							muscleGroup: m.muscleGroup,
							intensity: m.intensity,
							sets,
							reps: we.targetReps ?? undefined,
							weightKg,
							exerciseType: we.exercise.type,
							fatigueTier: we.exercise.fatigueTier,
							trainingGoal: goal
						})
					}
				}
			}

			const loads = computeMuscleLoad(contributions)
			const muscles = withZones(loads)
			return {
				program: {
					id: program.id,
					name: program.name,
					workoutCount: program.items.length,
					exerciseCount
				},
				muscles,
				totals: sumTotals(loads),
				balances: computeBalances(loads),
				belowMev: muscles.filter(m => m.zone === 'below_mev' && m.workingSets > 0)
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
