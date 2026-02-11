import { startCase } from 'es-toolkit'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { RestTimerProvider } from '~/features/workouts/RestTimerContext'
import { Nav } from './Nav'

function resolveTitle(pathname: string): string {
	const lastPath = pathname
		.split('/')
		.filter(s => !s.includes('_'))
		.pop()
	return startCase(lastPath ?? '')
}

export function RootLayout() {
	const { pathname } = useLocation()

	useEffect(() => {
		const title = resolveTitle(pathname)
		document.title = title === 'Macromaxxing' ? title : `${title} — Macromaxxing`
	}, [pathname])

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
