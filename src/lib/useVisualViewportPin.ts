import { useEffect, useRef } from 'react'

/**
 * Pins a `position: fixed` element to the bottom of the VISUAL viewport.
 *
 * iOS resolves `fixed` against the LAYOUT viewport, and it ignores `user-scalable=no`,
 * so the moment the reader pinch-zooms the two viewports come apart: the bottom bar
 * stays glued to the bottom of the (now larger, off-screen) layout viewport, which reads
 * as the bar hanging in the middle of the screen and drifting with the page instead of
 * staying put. Tracking `window.visualViewport` and re-laying the bar onto it puts it
 * back on the edge the reader can actually see.
 *
 * Only zoom/pan divergence is corrected. A shrunken visual viewport at scale 1 is the
 * software keyboard, where a bottom tab bar riding above the keys would cover the field
 * being typed into — that case keeps today's behaviour and stays behind the keyboard.
 */
export const useVisualViewportPin = <T extends HTMLElement>() => {
	const ref = useRef<T>(null)

	useEffect(() => {
		const viewport = window.visualViewport
		const el = ref.current
		if (!(viewport && el)) return

		let frame = 0

		const apply = () => {
			frame = 0
			const root = document.documentElement
			const zoomed = viewport.scale > 1.01 || viewport.offsetTop > 1 || viewport.offsetLeft > 1

			// Layout and visual viewports agree (every non-zoomed case, i.e. all of desktop and
			// Android): drop the overrides so the element's own CSS holds it in place.
			if (!zoomed) {
				el.style.removeProperty('bottom')
				el.style.removeProperty('left')
				el.style.removeProperty('width')
				return
			}

			// Rubber-banding can push the visual viewport past the layout one — clamp so the bar
			// never gets pushed below the screen edge.
			const gap = Math.max(0, root.clientHeight - (viewport.offsetTop + viewport.height))
			el.style.bottom = `${Math.round(gap)}px`
			el.style.left = `${Math.round(viewport.offsetLeft)}px`
			el.style.width = `${Math.round(viewport.width)}px`
		}

		// visualViewport scroll fires per frame while panning — coalesce into one write.
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(apply)
		}

		apply()
		viewport.addEventListener('resize', schedule)
		viewport.addEventListener('scroll', schedule)
		return () => {
			if (frame) cancelAnimationFrame(frame)
			viewport.removeEventListener('resize', schedule)
			viewport.removeEventListener('scroll', schedule)
		}
	}, [])

	return ref
}
