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
	cancelServer: (restId: TypeIDString<'rnj'>) => void
}

/** Starts one delivery attempt and returns its best-effort cancellation cleanup. */
export function startRestAlertDelivery(
	delivery: RestAlertDelivery,
	dependencies: RestAlertDeliveryDependencies
): () => void {
	let active = true
	let serverAttempted = false
	const timeoutId = setTimeout(() => {
		if (!active) return
		const remainingMs = delivery.rest.endAt - Date.now()
		if (remainingMs <= 0) return
		if (!dependencies.isOnline()) {
			dependencies.scheduleLocal(delivery.rest, delivery.sessionId)
			return
		}

		serverAttempted = true
		void dependencies
			.scheduleServer({
				restId: delivery.rest.id,
				sessionId: delivery.sessionId,
				subscriptionId: delivery.subscriptionId,
				remainingMs
			})
			.catch(() => {
				if (active && delivery.rest.endAt > Date.now() && dependencies.isCurrentRest(delivery.rest.id)) {
					dependencies.scheduleLocal(delivery.rest, delivery.sessionId)
				}
			})
	}, 0)

	return () => {
		active = false
		clearTimeout(timeoutId)
		dependencies.clearLocal(delivery.rest.id)
		if (serverAttempted && dependencies.isOnline()) dependencies.cancelServer(delivery.rest.id)
	}
}

export function useRestAlerts() {
	const rest = useWorkoutSessionStore(state => state.rest)
	const sessionId = useWorkoutSessionStore(state => state.sessionId)
	const subscriptionId = useRestAlertSubscriptionId()
	const { mutateAsync: scheduleRest } = trpc.restNotifications.scheduleRest.useMutation()
	const { mutate: cancelRest } = trpc.restNotifications.cancelRest.useMutation()

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
				cancelServer: restId => cancelRest({ restId })
			}
		)
	}, [rest, sessionId, subscriptionId, scheduleRest, cancelRest])
}
