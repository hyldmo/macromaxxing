import { Outlet } from 'react-router-dom'
import { RestTimerProvider } from '~/features/workouts/RestTimerContext'
import { Nav } from './Nav'

export function RootLayout() {
	return (
		<RestTimerProvider>
			<div className="min-h-screen bg-surface-0">
				<Nav />
				<main className="mx-auto max-w-7xl px-4 py-4 pb-20 md:pb-4">
					<Outlet />
				</main>
			</div>
		</RestTimerProvider>
	)
}
