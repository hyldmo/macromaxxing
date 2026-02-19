import type { SetType } from '@macromaxxing/db'
import {
	createContext,
	type FC,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState
} from 'react'

interface RestTimerState {
	remaining: number // positive = counting down, negative = overshot
	total: number
	endAt: number | null // absolute timestamp when timer reaches 0
	setType: SetType | null
	isRunning: boolean // true while timer is active (even when negative)
	isTransition: boolean
	sessionId: string | null
	startedAt: number | null
	setSession: (session: { id: string; startedAt?: number } | null) => void
	start: (durationSec: number, setType: SetType, transition?: boolean) => void
	dismiss: () => void
}

const RestTimerContext = createContext<RestTimerState | null>(null)

export const useRestTimer = () => {
	const ctx = useContext(RestTimerContext)
	if (!ctx) throw new Error('useRestTimer must be used within RestTimerProvider')
	return ctx
}

export const RestTimerProvider: FC<PropsWithChildren> = ({ children }) => {
	const [endAt, setEndAt] = useState<number | null>(null)
	const [total, setTotal] = useState(0)
	const [setType, setSetType] = useState<SetType | null>(null)
	const [remaining, setRemaining] = useState(0)
	const [sessionId, setSessionId] = useState<string | null>(null)
	const [startedAt, setStartedAt] = useState<number | null>(null)
	const [isTransition, setIsTransition] = useState(false)
	const completedRef = useRef(false)

	const start = useCallback((durationSec: number, type: SetType, transition = false) => {
		// Request notification permission on first use
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission()
		}
		setEndAt(Date.now() + durationSec * 1000)
		setTotal(durationSec)
		setSetType(type)
		setRemaining(durationSec)
		setIsTransition(transition)
		completedRef.current = false
	}, [])

	const setSession = useCallback((session: { id: string; startedAt?: number } | null) => {
		setSessionId(session?.id ?? null)
		if (session === null) {
			setStartedAt(null)
			// Dismiss any running rest timer when session ends
			setEndAt(null)
			setTotal(0)
			setSetType(null)
			setRemaining(0)
			setIsTransition(false)
			completedRef.current = false
		} else if (session.startedAt !== undefined) {
			setStartedAt(session.startedAt)
		}
	}, [])

	const dismiss = useCallback(() => {
		setEndAt(null)
		setTotal(0)
		setSetType(null)
		setRemaining(0)
		setIsTransition(false)
		completedRef.current = false
	}, [])

	useEffect(() => {
		if (endAt === null) return

		const fireNotification = () => {
			if (!completedRef.current) {
				completedRef.current = true
				if (navigator.vibrate) navigator.vibrate(200)
				if ('Notification' in window && Notification.permission === 'granted') {
					// Use SW showNotification — works even when app is backgrounded
					if ('serviceWorker' in navigator) {
						navigator.serviceWorker.ready.then(reg => {
							reg.showNotification('Rest timer done', {
								body: 'Time for your next set',
								tag: 'rest-timer',
								icon: '/pwa-192x192.png'
							})
						})
					} else {
						new Notification('Rest timer done', { body: 'Time for your next set', tag: 'rest-timer' })
					}
				}
			}
		}

		const tick = () => {
			const left = Math.ceil((endAt - Date.now()) / 1000)
			setRemaining(left)
			if (left <= 0) fireNotification()
		}
		tick()
		const intervalId = setInterval(tick, 1000)

		// Schedule a direct timeout for when the timer expires.
		// setInterval ticks are throttled to ~1/min in background tabs,
		// but a one-shot setTimeout with exact delay is scheduled more reliably.
		const delay = endAt - Date.now()
		const timeoutId =
			delay > 0
				? setTimeout(() => {
						fireNotification()
						setRemaining(Math.ceil((endAt - Date.now()) / 1000))
					}, delay)
				: undefined

		return () => {
			clearInterval(intervalId)
			if (timeoutId) clearTimeout(timeoutId)
		}
	}, [endAt])

	return (
		<RestTimerContext.Provider
			value={{
				remaining,
				total,
				endAt,
				setType,
				isRunning: endAt !== null,
				isTransition,
				sessionId,
				startedAt,
				setSession,
				start,
				dismiss
			}}
		>
			{children}
		</RestTimerContext.Provider>
	)
}
