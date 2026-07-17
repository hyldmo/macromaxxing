import type { WorkoutSession } from '@macromaxxing/db'
import { effectiveSetWeightKg } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { useWorkoutSessionStore } from '../store'

type SessionLog = RouterOutput['workout']['getSession']['logs'][number]

const OPTIMISTIC_PREFIX = 'wkl_optimistic_'

/** True while a log exists only optimistically — its server id hasn't arrived yet. */
export const isOptimisticLogId = (id: string): boolean => id.startsWith(OPTIMISTIC_PREFIX)

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
				const exerciseData =
					previous.logs.find(l => l.exerciseId === variables.exerciseId)?.exercise ??
					previous.plannedExercises.find(pe => pe.exerciseId === variables.exerciseId)?.exercise ??
					previous.workout?.exercises.find(e => e.exerciseId === variables.exerciseId)?.exercise
				if (exerciseData) {
					const existingCount = previous.logs.filter(l => l.exerciseId === variables.exerciseId).length
					utils.workout.getSession.setData(
						{ id: variables.sessionId },
						{
							...previous,
							logs: [
								...previous.logs,
								{
									id: optimisticId,
									sessionId: variables.sessionId,
									exerciseId: variables.exerciseId,
									setNumber: existingCount + 1,
									setType: variables.setType ?? 'working',
									weightKg: effectiveSetWeightKg(
										exerciseData.bwMultiplier,
										bodyWeightKg,
										variables.weightKg
									),
									reps: variables.reps,
									rpe: null,
									failureFlag: false,
									createdAt: Date.now(),
									exercise: exerciseData
								}
							]
						}
					)
				}
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
				{
					...current,
					logs: current.logs.map(l => (l.id === context.optimisticId ? { ...l, ...data } : l))
				}
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
			await utils.workout.getSession.cancel({ id: sessionId! })
			const previous = utils.workout.getSession.getData({ id: sessionId! })
			if (previous) {
				const targetLog = previous.logs.find(log => log.id === variables.id)
				const bwMultiplier = targetLog?.exercise.bwMultiplier ?? 0
				utils.workout.getSession.setData(
					{ id: sessionId! },
					{
						...previous,
						logs: previous.logs.map(log =>
							log.id === variables.id
								? {
										...log,
										...(variables.weightKg !== undefined && {
											weightKg: effectiveSetWeightKg(
												bwMultiplier,
												bodyWeightKg,
												variables.weightKg
											)
										}),
										...(variables.reps !== undefined && { reps: variables.reps }),
										...(variables.setType !== undefined && { setType: variables.setType }),
										...(variables.rpe !== undefined && { rpe: variables.rpe }),
										...(variables.failureFlag !== undefined && {
											failureFlag: variables.failureFlag
										})
									}
								: log
						)
					}
				)
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: sessionId! }, context.previous)
			}
		},
		onSettled: () => utils.workout.getSession.invalidate({ id: sessionId! })
	})

	const removeSet = trpc.workout.removeSet.useMutation({
		onMutate: async variables => {
			await utils.workout.getSession.cancel({ id: sessionId! })
			const previous = utils.workout.getSession.getData({ id: sessionId! })
			if (previous) {
				utils.workout.getSession.setData(
					{ id: sessionId! },
					{
						...previous,
						logs: previous.logs.filter(log => log.id !== variables.id)
					}
				)
			}
			return { previous }
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.workout.getSession.setData({ id: sessionId! }, context.previous)
			}
		},
		onSettled: () => utils.workout.getSession.invalidate({ id: sessionId! })
	})

	return { addSet, updateSet, removeSet }
}
