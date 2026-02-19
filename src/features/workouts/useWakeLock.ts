import { useEffect, useRef } from 'react'

/**
 * Acquires a Screen Wake Lock to prevent the display from dimming/locking.
 * Automatically re-acquires on visibility change (e.g. tab switch back).
 * Releases on unmount.
 */
export function useWakeLock(enabled = true) {
	const lockRef = useRef<WakeLockSentinel | null>(null)

	useEffect(() => {
		if (!(enabled && 'wakeLock' in navigator)) return

		const acquire = () =>
			navigator.wakeLock
				.request('screen')
				.then(lock => {
					lockRef.current = lock
				})
				.catch(() => undefined)

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible' && lockRef.current?.released !== false) {
				acquire()
			}
		}

		acquire()
		document.addEventListener('visibilitychange', onVisibilityChange)

		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange)
			lockRef.current?.release()
			lockRef.current = null
		}
	}, [enabled])
}
