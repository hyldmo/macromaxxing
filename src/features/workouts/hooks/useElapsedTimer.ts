import { useEffect, useState } from 'react'

const TICK_MS = 33 // ~30fps

/** Ticks at ~30fps, returning `Date.now() - timestamp` in ms. Returns 0 when null. */
export function useElapsedTimer(timestamp: number | null): number {
	const [elapsed, setElapsed] = useState(0)

	useEffect(() => {
		if (timestamp === null) {
			setElapsed(0)
			return
		}
		const tick = () => setElapsed(Date.now() - timestamp)
		tick()
		const id = setInterval(tick, TICK_MS)
		return () => clearInterval(id)
	}, [timestamp])

	return elapsed
}
