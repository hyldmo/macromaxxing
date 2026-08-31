import { useSyncExternalStore } from 'react'
import { getRestAlertSubscriptionId, subscribeToRestAlertSubscription } from '~/lib/restAlerts'

export function useRestAlertSubscriptionId() {
	return useSyncExternalStore(subscribeToRestAlertSubscription, getRestAlertSubscriptionId, () => null)
}
