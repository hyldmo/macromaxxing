import { Outlet } from 'react-router'
import { usePushRouting } from '~/features/workouts/hooks/usePushRouting'
import { useRestAlerts } from '~/features/workouts/hooks/useRestAlerts'
import { ReloadPrompt } from '../ui/ReloadPrompt'
import { Nav } from './Nav'

export function RootLayout() {
	useRestAlerts()
	usePushRouting()

	return (
		<div className="min-h-screen bg-surface-0">
			<Nav />
			<main className="mx-auto max-w-lvw px-3 py-4 pb-20 md:max-w-7xl md:px-4 md:pb-4">
				<Outlet />
			</main>
			<ReloadPrompt />
		</div>
	)
}
