import { useEffect } from 'react'
import { APP_SCROLLER_ID } from './constants'

let lockCount = 0
let savedScrollTop = 0

/** Locks background scroll while the calling component is mounted. Ref-counted so multiple consumers don't conflict. */
export const useScrollLock = () => {
	useEffect(() => {
		lockCount++
		// The document never scrolls — the shell's inner scroller does — so the lock has to
		// land on that element. Toggling `overflow` is enough; the old body-position trick
		// existed only to stop the document from scrolling behind the overlay.
		const scroller = document.getElementById(APP_SCROLLER_ID)
		if (lockCount === 1 && scroller) {
			savedScrollTop = scroller.scrollTop
			scroller.style.overflow = 'hidden'
		}
		return () => {
			lockCount--
			if (lockCount === 0 && scroller) {
				scroller.style.overflow = ''
				scroller.scrollTop = savedScrollTop
			}
		}
	}, [])
}
