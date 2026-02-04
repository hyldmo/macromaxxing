import { Outlet } from 'react-router-dom'
import { Nav } from './Nav'

export function RootLayout() {
	return (
		<div className="min-h-screen bg-surface-0">
			<Nav />
			<main className="mx-auto max-w-4xl px-4 py-4">
				<Outlet />
			</main>
		</div>
	)
}
