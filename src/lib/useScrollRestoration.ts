import { type RefObject, useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** Scroll offset per history entry key. Lives for the tab's lifetime, like the history stack it mirrors. */
const positions = new Map<string, number>()

// The root route is pre-rendered at build time (ssr: false still prerenders), where
// useLayoutEffect warns and there is no scroller to touch.
const useIsomorphicLayoutEffect = import.meta.env.SSR ? useEffect : useLayoutEffect

/**
 * Scroll restoration for the shell's inner scroller.
 *
 * The document doesn't scroll, so react-router's `<ScrollRestoration />` — which drives
 * `window.scrollTo` — has nothing to act on. Same contract as the one it replaces:
 * back/forward returns you to where you were, every other navigation starts at the top.
 */
export const useScrollRestoration = (ref: RefObject<HTMLElement | null>) => {
	const { key } = useLocation()
	const navigationType = useNavigationType()

	useEffect(() => {
		const el = ref.current
		if (!el) return
		let frame = 0
		// Recorded as it happens rather than on unmount: a route can swap out without the
		// scroller unmounting, which would lose the offset the user is about to come back to.
		const onScroll = () => {
			if (frame) return
			frame = requestAnimationFrame(() => {
				frame = 0
				positions.set(key, el.scrollTop)
			})
		}
		el.addEventListener('scroll', onScroll, { passive: true })
		return () => {
			el.removeEventListener('scroll', onScroll)
			if (frame) cancelAnimationFrame(frame)
		}
	}, [ref, key])

	// Before paint, so an incoming page never flashes at the outgoing page's offset.
	useIsomorphicLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		el.scrollTop = navigationType === 'POP' ? (positions.get(key) ?? 0) : 0
	}, [ref, key, navigationType])
}
