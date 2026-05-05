import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { ReloadPrompt } from './ui/ReloadPrompt'

async function clearCacheAndReload() {
	const regs = await navigator.serviceWorker?.getRegistrations()
	await Promise.all(regs?.map(r => r.unregister()) ?? [])
	const keys = await caches.keys()
	await Promise.all(keys.map(k => caches.delete(k)))
	location.reload()
}

export const ErrorBoundary: FC = () => {
	const error = useRouteError()
	const isNotFound = !error || (isRouteErrorResponse(error) && error.status === 404)

	return (
		<>
			<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
				<AlertTriangle className="size-12 text-ink-muted" />
				<div className="space-y-1">
					<h1 className="font-mono text-4xl text-ink tabular-nums">{isNotFound ? '404' : 'Error'}</h1>
					<p className="text-ink-muted">
						{isNotFound ? "This page doesn't exist." : 'Something went wrong.'}
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						to="/"
						className="inline-flex h-8 items-center gap-2 rounded-sm border border-edge bg-transparent px-3 font-medium text-ink text-sm transition-colors hover:bg-surface-2"
					>
						<Home className="size-4" />
						Go home
					</Link>
					{!isNotFound && (
						<button
							type="button"
							onClick={clearCacheAndReload}
							className="inline-flex h-8 items-center gap-2 rounded-sm bg-accent px-3 font-medium text-sm text-white transition-colors hover:bg-accent-hover"
						>
							<RefreshCw className="size-4" />
							Clear cache & reload
						</button>
					)}
				</div>
			</div>
			{!isNotFound && <ReloadPrompt />}
		</>
	)
}
