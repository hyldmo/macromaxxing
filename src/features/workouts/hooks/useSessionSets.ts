import type { WorkoutSession } from '@macromaxxing/db'
import { effectiveSetWeightKg } from '~/lib'
import { type RouterInput, type RouterOutput, trpc } from '~/lib/trpc'
import { useWorkoutSessionStore } from '../store'

type SessionData = RouterOutput['workout']['getSession']
type SessionLog = SessionData['logs'][number]

const OPTIMISTIC_PREFIX = 'wkl_optimistic_'

/** True while a log exists only optimistically — its server id hasn't arrived yet. */
export const isOptimisticLogId = (id: string): boolean => id.startsWith(OPTIMISTIC_PREFIX)

/**
 * Insert an optimistic log for a set that hasn't reached the server yet: exercise
 * data comes from an existing log, the plan snapshot, or the template (in that
 * order); setNumber continues that exercise's count. Null when the exercise is
 * unknown — no optimistic entry, the settle refetch shows the log instead.
 */
export function withOptimisticLog(
	previous: SessionData,
	vars: RouterInput['workout']['addSet'],
	optimisticId: SessionLog['id'],
	bodyWeightKg: number | null
): SessionData | null {
	const exercise =
		previous.logs.find(l => l.exerciseId === vars.exerciseId)?.exercise ??
		previous.plannedExercises.find(pe => pe.exerciseId === vars.exerciseId)?.exercise ??
		previous.workout?.exercises.find(e => e.exerciseId === vars.exerciseId)?.exercise
	if (!exercise) return null
	const existingCount = previous.logs.filter(l => l.exerciseId === vars.exerciseId).length
	return {
		...previous,
		logs: [
			...previous.logs,
			{
				id: optimisticId,
				sessionId: vars.sessionId,
				exerciseId: vars.exerciseId,
				setNumber: existingCount + 1,
				setType: vars.setType ?? 'working',
				weightKg: effectiveSetWeightKg(exercise.bwMultiplier, bodyWeightKg, vars.weightKg),
				reps: vars.reps,
				rpe: null,
				failureFlag: false,
				createdAt: Date.now(),
				exercise
			}
		]
	}
}

/** Swap the optimistic id for the server log once it lands, keeping the loaded exercise relation. */
export function withServerLog(
	current: SessionData,
	optimisticId: SessionLog['id'],
	log: RouterOutput['workout']['addSet']
): SessionData {
	return {
		...current,
		logs: current.logs.map(l => (l.id === optimisticId ? { ...l, ...log } : l))
	}
}

/** Apply an updateSet patch to the cached log, converting added kg to effective load for bodyweight exercises. */
export function withPatchedLog(
	previous: SessionData,
	patch: RouterInput['workout']['updateSet'],
	bodyWeightKg: number | null
): SessionData {
	const bwMultiplier = previous.logs.find(log => log.id === patch.id)?.exercise.bwMultiplier ?? 0
	return {
		...previous,
		logs: previous.logs.map(log =>
			log.id === patch.id
				? {
						...log,
						...(patch.weightKg !== undefined && {
							weightKg: effectiveSetWeightKg(bwMultiplier, bodyWeightKg, patch.weightKg)
						}),
						...(patch.reps !== undefined && { reps: patch.reps }),
						...(patch.setType !== undefined && { setType: patch.setType }),
						...(patch.rpe !== undefined && { rpe: patch.rpe }),
						...(patch.failureFlag !== undefined && { failureFlag: patch.failureFlag })
					}
				: log
		)
	}
}

/**
 * Session set mutations with optimistic getSession cache updates, shared by the
 * checklist page and timer mode. Rest timers are the caller's concern (the
 * checklist starts one per confirmed set, the timer runs its own) — except on add
 * failure, where any optimistically started rest is cleared here.
 */
export function useSessionSets(sessionId: WorkoutSession['id'] | undefined) {
	const utils = trpc.useUtils()
	const profileQuery = trpc.settings.getProfile.useQuery()
	const bodyWeightKg = profileQuery.data?.weightKg ?? null

	const addSet = trpc.workout.addSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: variables.sessionId })
			const previous = utils.workout.getSession.getData({ id: variables.sessionId })
			const optimisticId: SessionLog['id'] = `${OPTIMISTIC_PREFIX}${Date.now()}`
			if (previous) {
				const next = withOptimisticLog(previous, variables, optimisticId, bodyWeightKg)
				if (next) utils.workout.getSession.setData({ id: variables.sessionId }, next)
			}
			return { previous, optimisticId }
		},
		onSuccess: (data, variables, context) => {
			// Swap the optimistic id for the real one immediately, so slot edits can
			// target the log without waiting for the invalidation refetch
			const current = utils.workout.getSession.getData({ id: variables.sessionId })
			if (!current) return
			utils.workout.getSession.setData(
				{ id: variables.sessionId },
				withServerLog(current, context.optimisticId, data)
			)
		},
		onError: (_err, variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: variables.sessionId }, context.previous)
			}
			// A rest timer started for this set has nothing to rest from
			useWorkoutSessionStore.getState().dismissRest()
		},
		onSettled: (_data, _err, variables) => utils.workout.getSession.invalidate({ id: variables.sessionId })
	})

	const updateSet = trpc.workout.updateSet.useMutation({
		onMutate: async variables => {
			if (!sessionId) return { previous: undefined }
			await utils.workout.getSession.cancel({ id: sessionId })
			const previous = utils.workout.getSession.getData({ id: sessionId })
			if (previous) {
				utils.workout.getSession.setData({ id: sessionId }, withPatchedLog(previous, variables, bodyWeightKg))
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (sessionId && context?.previous) {
				utils.workout.getSession.setData({ id: sessionId }, context.previous)
			}
		},
		onSettled: () => {
			if (sessionId) utils.workout.getSession.invalidate({ id: sessionId })
		}
	})

	const removeSet = trpc.workout.removeSet.useMutation({
		onMutate: async variables => {
			if (!sessionId) return { previous: undefined }
			await utils.workout.getSession.cancel({ id: sessionId })
			const previous = utils.workout.getSession.getData({ id: sessionId })
			if (previous) {
				utils.workout.getSession.setData(
					{ id: sessionId },
					{
						...previous,
						logs: previous.logs.filter(log => log.id !== variables.id)
					}
				)
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (sessionId && context?.previous) {
				utils.workout.getSession.setData({ id: sessionId }, context.previous)
			}
		},
		onSettled: () => {
			if (sessionId) utils.workout.getSession.invalidate({ id: sessionId })
		}
	})

	return { addSet, updateSet, removeSet }
}
