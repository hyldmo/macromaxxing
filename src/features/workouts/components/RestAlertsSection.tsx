import { useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, Switch, TRPCError } from '~/components/ui'
import { getOrCreatePushSubscription, serializePushSubscription, supportsRestAlerts } from '~/lib/pushSubscriptions'
import { setRestAlertSubscriptionId } from '~/lib/restAlerts'
import { trpc } from '~/lib/trpc'
import { useRestAlertSubscriptionId } from '../hooks/useRestAlertSubscriptionId'
import { clearLocalRestNotification } from '../store/useWorkoutSessionStore'

export function RestAlertsSection() {
	const subscriptionId = useRestAlertSubscriptionId()
	const publicKeyQuery = trpc.restNotifications.publicKey.useQuery(undefined, { retry: false })
	const registerMutation = trpc.restNotifications.registerSubscription.useMutation()
	const { mutateAsync: registerSubscription } = registerMutation
	const unregisterMutation = trpc.restNotifications.unregisterSubscription.useMutation()
	const testMutation = trpc.restNotifications.sendTestNotification.useMutation()
	const [reconciling, setReconciling] = useState(true)
	const [localError, setLocalError] = useState<string | null>(null)
	const [testAccepted, setTestAccepted] = useState(false)
	const supported = supportsRestAlerts()
	const pending = reconciling || registerMutation.isPending || unregisterMutation.isPending || testMutation.isPending
	const trpcError = registerMutation.error ?? unregisterMutation.error ?? testMutation.error ?? publicKeyQuery.error

	useEffect(() => {
		if (!supported) {
			setRestAlertSubscriptionId(null)
			setReconciling(false)
			return
		}
		let active = true
		void (async () => {
			try {
				const registration = await navigator.serviceWorker.ready
				const subscription = await registration.pushManager.getSubscription()
				if (!subscription) {
					if (active) setRestAlertSubscriptionId(null)
					return
				}
				const registered = await registerSubscription(serializePushSubscription(subscription))
				if (active) setRestAlertSubscriptionId(registered.id)
			} catch {
				if (active) {
					setRestAlertSubscriptionId(null)
					setLocalError('Could not restore rest alerts. Turn them on to try again.')
				}
			} finally {
				if (active) setReconciling(false)
			}
		})()
		return () => {
			active = false
		}
	}, [registerSubscription, supported])

	async function enable() {
		setLocalError(null)
		setTestAccepted(false)
		registerMutation.reset()
		let subscription: PushSubscription | null = null
		try {
			const permission = await Notification.requestPermission()
			if (permission !== 'granted') throw new Error('Notifications are not allowed in browser settings.')
			const publicKeyResult = publicKeyQuery.data ?? (await publicKeyQuery.refetch()).data
			if (!publicKeyResult) throw new Error('Rest alerts are not configured yet.')
			const registration = await navigator.serviceWorker.ready
			subscription = await getOrCreatePushSubscription(registration.pushManager, publicKeyResult.publicKey)
			const registered = await registerSubscription(serializePushSubscription(subscription))
			setRestAlertSubscriptionId(registered.id)
		} catch (error) {
			await subscription?.unsubscribe().catch(() => false)
			setRestAlertSubscriptionId(null)
			setLocalError(error instanceof Error ? error.message : 'Could not enable rest alerts.')
		}
	}

	async function disable() {
		setLocalError(null)
		setTestAccepted(false)
		unregisterMutation.reset()
		clearLocalRestNotification()
		const registration = await navigator.serviceWorker.ready.catch(() => null)
		const browserSubscription = await registration?.pushManager.getSubscription().catch(() => null)
		const results = await Promise.allSettled([
			browserSubscription?.unsubscribe(),
			subscriptionId ? unregisterMutation.mutateAsync({ subscriptionId }) : Promise.resolve()
		])
		setRestAlertSubscriptionId(null)
		if (results.some(result => result.status === 'rejected')) {
			setLocalError('Rest alerts were turned off locally, but server cleanup could not be confirmed.')
		}
	}

	async function sendTest() {
		if (!subscriptionId) return
		setLocalError(null)
		setTestAccepted(false)
		testMutation.reset()
		try {
			await testMutation.mutateAsync({ subscriptionId })
			setTestAccepted(true)
		} catch (error) {
			if (error instanceof Error && error.message.includes('expired')) {
				const registration = await navigator.serviceWorker.ready.catch(() => null)
				const browserSubscription = await registration?.pushManager.getSubscription().catch(() => null)
				await browserSubscription?.unsubscribe().catch(() => false)
				setRestAlertSubscriptionId(null)
			}
		}
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="font-medium text-ink text-sm">Rest alerts</h2>
				<p className="text-ink-muted text-xs">Notify you when a workout rest period ends.</p>
			</CardHeader>
			<CardContent className="space-y-3">
				<label className="flex items-start gap-3" htmlFor="rest-alerts">
					<Switch
						id="rest-alerts"
						checked={subscriptionId !== null}
						onChange={checked => void (checked ? enable() : disable())}
						disabled={!supported || pending}
						className="mt-0.5"
					/>
					<div>
						<div className="text-ink text-sm">Rest alerts</div>
						<div className="text-ink-faint text-xs">Works after you close or lock the installed app.</div>
					</div>
				</label>

				<Button variant="outline" onClick={() => void sendTest()} disabled={!subscriptionId || pending}>
					{testMutation.isPending ? 'Testing...' : 'Test notification'}
				</Button>

				{testAccepted && <p className="text-success text-xs">Test accepted.</p>}
				{localError && (
					<p className="rounded-md bg-destructive/10 px-3 py-1.5 text-destructive text-sm">{localError}</p>
				)}
				<TRPCError error={trpcError} raw />
			</CardContent>
		</Card>
	)
}
