import { type TypeIDString, zodTypeID } from '@macromaxxing/db'

const REST_ALERT_SUBSCRIPTION_KEY = 'rest-alert-subscription-id'

let memorySubscriptionId: TypeIDString<'psb'> | null = null
const listeners = new Set<() => void>()

function storage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage
}

export function getRestAlertSubscriptionId(): TypeIDString<'psb'> | null {
	const value = storage()?.getItem(REST_ALERT_SUBSCRIPTION_KEY) ?? memorySubscriptionId
	const parsed = zodTypeID('psb').safeParse(value)
	return parsed.success ? parsed.data : null
}

export function setRestAlertSubscriptionId(subscriptionId: TypeIDString<'psb'> | null): void {
	memorySubscriptionId = subscriptionId
	const target = storage()
	if (subscriptionId === null) target?.removeItem(REST_ALERT_SUBSCRIPTION_KEY)
	else target?.setItem(REST_ALERT_SUBSCRIPTION_KEY, subscriptionId)
	for (const listener of listeners) listener()
}

export function subscribeToRestAlertSubscription(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}
