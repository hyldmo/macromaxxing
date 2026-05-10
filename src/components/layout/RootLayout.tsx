import { Outlet } from 'react-router'
import { ReloadPrompt } from '../ui/ReloadPrompt'
import { Nav } from './Nav'

export function RootLayout() {
	return (
		<div className="min-h-screen bg-surface-0">
			<Nav />
			<main className="mx-auto max-w-7xl px-3 py-4 pb-20 md:px-4 md:pb-4">
				<Outlet />
			</main>
			<ReloadPrompt />
		</div>
	)
}
