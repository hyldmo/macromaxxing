import { useEffect, useState } from 'react'

/** Ticks every second from a start timestamp. Returns 0 when startedAt is null. */
export function useElapsedTimer(startedAt: number | null): number {
	const [elapsedMs, setElapsedMs] = useState(0)

	useEffect(() => {
		if (startedAt === null) {
			setElapsedMs(0)
			return
		}
		const tick = () => setElapsedMs(Date.now() - startedAt)
		tick()
		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [startedAt])

	return elapsedMs
}
