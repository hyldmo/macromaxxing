import type { SetType, TrainingGoal } from '@macromaxxing/db'
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
	remaining: number
	total: number
	setType: SetType | null
	isRunning: boolean
	sessionGoal: TrainingGoal | null
	start: (durationSec: number, setType: SetType) => void
	extend: (sec: number) => void
	dismiss: () => void
	setSessionGoal: (goal: TrainingGoal | null) => void
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
	const [sessionGoal, setSessionGoal] = useState<TrainingGoal | null>(null)
	const completedRef = useRef(false)

	const start = useCallback((durationSec: number, type: SetType) => {
		// Request notification permission on first use
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission()
		}
		setEndAt(Date.now() + durationSec * 1000)
		setTotal(durationSec)
		setSetType(type)
		setRemaining(durationSec)
		completedRef.current = false
	}, [])

	const extend = useCallback((sec: number) => {
		setEndAt(prev => (prev ? prev + sec * 1000 : null))
		setTotal(prev => prev + sec)
	}, [])

	const dismiss = useCallback(() => {
		setEndAt(null)
		setTotal(0)
		setSetType(null)
		setRemaining(0)
		completedRef.current = false
	}, [])

	useEffect(() => {
		if (endAt === null) return

		const tick = () => {
			const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
			setRemaining(left)
			if (left === 0 && !completedRef.current) {
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
				isRunning: endAt !== null && remaining > 0,
				sessionGoal,
				start,
				extend,
				dismiss,
				setSessionGoal
			}}
		>
			{children}
		</RestTimerContext.Provider>
	)
}
