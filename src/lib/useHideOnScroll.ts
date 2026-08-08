import { useEffect, useState } from 'react'
import { APP_SCROLLER_ID } from './constants'

/** Distance that has to accumulate in ONE direction before the bar reacts — kills jitter. */
const THRESHOLD = 12
/** Near the top the bar is always shown, so a short page can never strand it off-screen. */
const ALWAYS_SHOW_ABOVE = 24

/**
 * True while the reader is scrolling DOWN, for chrome that should get out of the way.
 *
 * This buys back the screen height the app-shell costs. Because the document no longer
 * scrolls (see RootLayout), mobile browsers stop auto-collapsing their own chrome — so the
 * app collapses its chrome instead, and reclaims more than the browser was giving back.
 *
 * Reads the scroller by id rather than taking a ref so nav-level chrome doesn't have to be
 * prop-drilled from the layout, same as `useScrollLock`.
 */
export const useHideOnScroll = () => {
	const [hidden, setHidden] = useState(false)

	useEffect(() => {
		const scroller = document.getElementById(APP_SCROLLER_ID)
		if (!scroller) return

		let anchor = scroller.scrollTop
		let frame = 0

		const read = () => {
			frame = 0
			const y = scroller.scrollTop
			// Shown at both ends: near the top for the reason above, and at the very bottom so
			// the space content reserves for the bar doesn't read as a blank strip.
			const atEnd = y + scroller.clientHeight >= scroller.scrollHeight - 8
			if (y <= ALWAYS_SHOW_ABOVE || atEnd) {
				anchor = y
				setHidden(false)
				return
			}
			const delta = y - anchor
			// Under the threshold the anchor deliberately stays put, so slow drags still
			// accumulate to a decision instead of being discarded frame by frame.
			if (Math.abs(delta) < THRESHOLD) return
			anchor = y
			setHidden(delta > 0)
		}

		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(read)
		}

		scroller.addEventListener('scroll', onScroll, { passive: true })
		return () => {
			scroller.removeEventListener('scroll', onScroll)
			if (frame) cancelAnimationFrame(frame)
		}
	}, [])

	return hidden
}
