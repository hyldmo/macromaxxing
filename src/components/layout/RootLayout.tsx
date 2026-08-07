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

	// Fixed-height shell: the document never scrolls, this <main> does. That's what keeps the
	// mobile tab bar welded to the bottom edge on iOS — see the note in index.css.
	return (
		<div className="flex h-full flex-col bg-surface-0">
			{/* Nav emits the top bar, the bottom tab bar and the drawer as one fragment, so the
			    scroller is ordered between the two bars rather than splitting the component. */}
			<Nav />
			<main id={APP_SCROLLER_ID} ref={scrollerRef} className="order-2 flex-1 overflow-y-auto overscroll-contain">
				<div className="mx-auto max-w-7xl px-3 py-4 md:px-4">
					<Outlet />
				</div>
			</main>
			<ReloadPrompt />
		</div>
	)
}
