import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { ReloadPrompt } from '../ui/ReloadPrompt'
import { Nav } from './Nav'

export function RootLayout() {
	const navigate = useNavigate()

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

	return (
		<div className="min-h-screen bg-surface-0">
			<Nav />
			{/* Bottom reserve clears the fixed tab bar, which is now taller by the home-indicator inset. */}
			<main className="mx-auto max-w-lvw px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:max-w-7xl md:px-4 md:pb-4">
				<Outlet />
			</main>
			<ReloadPrompt />
		</div>
	)
}
