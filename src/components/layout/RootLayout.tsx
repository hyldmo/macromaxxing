import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { APP_SCROLLER_ID, useScrollRestoration } from '~/lib'
import { ReloadPrompt } from '../ui/ReloadPrompt'
import { Nav } from './Nav'

export function RootLayout() {
	const navigate = useNavigate()
	const scrollerRef = useRef<HTMLElement>(null)

	useScrollRestoration(scrollerRef)

	// Notification clicks arrive as SW messages so navigation stays client-side —
	// a hard navigate would reload the app and drop mid-session timer state
	useEffect(() => {
		if (!('serviceWorker' in navigator)) return
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type === 'navigate' && typeof event.data.url === 'string') navigate(event.data.url)
		}
		navigator.serviceWorker.addEventListener('message', onMessage)
		return () => navigator.serviceWorker.removeEventListener('message', onMessage)
	}, [navigate])

	// Fixed-height shell: the document never scrolls, this <main> does. The mobile tab bar
	// positions against this box — whose geometry is stable — instead of against the viewport
	// iOS re-measures mid-scroll, which is what kept it welded to the bottom edge. See index.css.
	return (
		<div className="relative flex h-full flex-col bg-surface-0">
			<Nav />
			<main id={APP_SCROLLER_ID} ref={scrollerRef} className="flex-1 overflow-y-auto overscroll-contain">
				{/* pb-20 reserves the tab bar's strip, which overlays the bottom of this scroller. */}
				<div className="mx-auto max-w-7xl px-3 pt-4 pb-20 md:px-4 md:pb-4">
					<Outlet />
				</div>
			</main>
			<ReloadPrompt />
		</div>
	)
}
