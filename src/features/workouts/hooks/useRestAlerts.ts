import type { TypeIDString } from '@macromaxxing/db'
import { useEffect } from 'react'
import { trpc } from '~/lib/trpc'
import {
	clearLocalRestNotification,
	scheduleLocalRestNotification,
	useWorkoutSessionStore,
	type WorkoutSessionStore
} from '../store/useWorkoutSessionStore'
import { useRestAlertSubscriptionId } from './useRestAlertSubscriptionId'

interface RestAlertDelivery {
	rest: NonNullable<WorkoutSessionStore['rest']>
	sessionId: TypeIDString<'wks'>
	subscriptionId: TypeIDString<'psb'>
}

interface RestAlertDeliveryDependencies {
	isOnline: () => boolean
	isCurrentRest: (restId: TypeIDString<'rnj'>) => boolean
	scheduleLocal: (rest: RestAlertDelivery['rest'], sessionId: TypeIDString<'wks'>) => void
	clearLocal: (restId: TypeIDString<'rnj'>) => void
	scheduleServer: (input: {
		restId: TypeIDString<'rnj'>
		sessionId: TypeIDString<'wks'>
		subscriptionId: TypeIDString<'psb'>
		remainingMs: number
	}) => Promise<unknown>
	cancelServer: (input: {
		restId: TypeIDString<'rnj'>
		sessionId: TypeIDString<'wks'>
		subscriptionId: TypeIDString<'psb'>
	}) => Promise<unknown>
}

function isDefinitiveScheduleFailure(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'data' in error && error.data !== undefined
}

/** Starts one delivery attempt and returns its best-effort cancellation cleanup. */
export function startRestAlertDelivery(
	delivery: RestAlertDelivery,
	dependencies: RestAlertDeliveryDependencies
): () => void {
	let active = true
	let serverRequest: Promise<unknown> | null = null
	const timeoutId = setTimeout(() => {
		if (!active) return
		const remainingMs = delivery.rest.endAt - Date.now()
		if (remainingMs <= 0) return
		if (!dependencies.isOnline()) {
			dependencies.scheduleLocal(delivery.rest, delivery.sessionId)
			return
		}

		serverRequest = dependencies.scheduleServer({
			restId: delivery.rest.id,
			sessionId: delivery.sessionId,
			subscriptionId: delivery.subscriptionId,
			remainingMs
		})
		void serverRequest.catch(async error => {
			if (!active || delivery.rest.endAt <= Date.now() || !dependencies.isCurrentRest(delivery.rest.id)) return
			const cancelInput = {
				restId: delivery.rest.id,
				sessionId: delivery.sessionId,
				subscriptionId: delivery.subscriptionId
			}
			if (isDefinitiveScheduleFailure(error)) {
				void dependencies.cancelServer(cancelInput).catch(() => undefined)
			} else {
				try {
					await dependencies.cancelServer(cancelInput)
				} catch {
					// The schedule result is indeterminate, so a local alert could duplicate a queued push.
					return
				}
			}
			if (active && delivery.rest.endAt > Date.now() && dependencies.isCurrentRest(delivery.rest.id)) {
				dependencies.scheduleLocal(delivery.rest, delivery.sessionId)
			}
		})
	}, 0)

	return () => {
		active = false
		clearTimeout(timeoutId)
		dependencies.clearLocal(delivery.rest.id)
		if (serverRequest && dependencies.isOnline()) {
			void dependencies
				.cancelServer({
					restId: delivery.rest.id,
					sessionId: delivery.sessionId,
					subscriptionId: delivery.subscriptionId
				})
				.catch(() => undefined)
		}
	}
}

export function useRestAlerts() {
	const rest = useWorkoutSessionStore(state => state.rest)
	const sessionId = useWorkoutSessionStore(state => state.sessionId)
	const subscriptionId = useRestAlertSubscriptionId()
	const { mutateAsync: scheduleRest } = trpc.restNotifications.scheduleRest.useMutation()
	const { mutateAsync: cancelRest } = trpc.restNotifications.cancelRest.useMutation()

	useEffect(() => {
		if (!(rest && sessionId && subscriptionId) || rest.endAt <= Date.now()) return
		return startRestAlertDelivery(
			{ rest, sessionId, subscriptionId },
			{
				isOnline: () => navigator.onLine,
				isCurrentRest: restId => useWorkoutSessionStore.getState().rest?.id === restId,
				scheduleLocal: scheduleLocalRestNotification,
				clearLocal: clearLocalRestNotification,
				scheduleServer: scheduleRest,
				cancelServer: cancelRest
			}
		)
	}, [rest, sessionId, subscriptionId, scheduleRest, cancelRest])
}
