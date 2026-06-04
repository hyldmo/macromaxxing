import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { ReloadPrompt } from './ui/ReloadPrompt'

async function clearCacheAndReload() {
	const regs = await navigator.serviceWorker?.getRegistrations()
	await Promise.all(regs?.map(r => r.unregister()) ?? [])
	const keys = await caches.keys()
	await Promise.all(keys.map(k => caches.delete(k)))
	location.reload()
}

function getErrorMessage(error: unknown): string | null {
	if (isRouteErrorResponse(error)) return typeof error.data === 'string' ? error.data : error.statusText || null
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	return null
}

export const ErrorBoundary: FC = () => {
	const error = useRouteError()
	const isNotFound = !error || (isRouteErrorResponse(error) && error.status === 404)
	const message = isNotFound ? null : getErrorMessage(error)

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
				{message && (
					<pre className="max-w-md whitespace-pre-wrap break-words rounded-sm border border-edge bg-surface-1 px-3 py-2 text-left font-mono text-ink-muted text-xs">
						{message}
					</pre>
				)}
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
