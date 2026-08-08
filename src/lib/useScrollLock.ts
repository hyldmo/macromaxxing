import { useEffect } from 'react'

let lockCount = 0
let savedScrollY = 0

/** Locks background scroll while the calling component is mounted. Ref-counted so multiple consumers don't conflict. */
export const useScrollLock = () => {
	useEffect(() => {
		lockCount++
		if (lockCount === 1) {
			savedScrollY = window.scrollY
			document.documentElement.classList.add('scroll-locked')
			document.body.style.position = 'fixed'
			document.body.style.top = `-${savedScrollY}px`
			document.body.style.left = '0'
			document.body.style.right = '0'
		}
		return () => {
			lockCount--
			if (lockCount === 0) {
				document.documentElement.classList.remove('scroll-locked')
				document.body.style.position = ''
				document.body.style.top = ''
				document.body.style.left = ''
				document.body.style.right = ''
				window.scrollTo(0, savedScrollY)
			}
		}
	}, [])
}
