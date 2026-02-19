import { useEffect } from 'react'

let lockCount = 0

/** Locks background scroll while the calling component is mounted. Ref-counted so multiple consumers don't conflict. */
export const useScrollLock = () => {
	useEffect(() => {
		lockCount++
		if (lockCount === 1) {
			document.documentElement.classList.add('scroll-locked')
		}
		return () => {
			lockCount--
			if (lockCount === 0) {
				document.documentElement.classList.remove('scroll-locked')
			}
		}
	}, [])
}
