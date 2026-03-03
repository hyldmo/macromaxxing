import { useEffect, useState } from 'react'

export function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

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
