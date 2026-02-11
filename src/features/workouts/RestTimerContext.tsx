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
	setType: SetType | null
	isRunning: boolean // true while timer is active (even when negative)
	isTransition: boolean
	sessionId: string | null
	setSessionId: (id: string | null) => void
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

		const tick = () => {
			const left = Math.ceil((endAt - Date.now()) / 1000)
			setRemaining(left)
			if (left <= 0 && !completedRef.current) {
				completedRef.current = true
				if (navigator.vibrate) navigator.vibrate(200)
				if ('Notification' in window && Notification.permission === 'granted') {
					new Notification('Rest timer done', { body: 'Time for your next set', tag: 'rest-timer' })
				}
			}
		}
		tick()
		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [endAt])

	return (
		<RestTimerContext.Provider
			value={{
				remaining,
				total,
				setType,
				isRunning: endAt !== null,
				isTransition,
				sessionId,
				setSessionId,
				start,
				dismiss
			}}
		>
			{children}
		</RestTimerContext.Provider>
	)
}
