import { AlertTriangle, Home } from 'lucide-react'
import type { FC } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export const ErrorBoundary: FC = () => {
	const error = useRouteError()
	// Show 404 for catch-all routes (no error) or actual 404 responses
	const isNotFound = !error || (isRouteErrorResponse(error) && error.status === 404)

	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
			<AlertTriangle className="size-12 text-ink-muted" />
			<div className="space-y-1">
				<h1 className="font-mono text-4xl text-ink tabular-nums">{isNotFound ? '404' : 'Error'}</h1>
				<p className="text-ink-muted">{isNotFound ? "This page doesn't exist." : 'Something went wrong.'}</p>
			</div>
			<Link
				to="/"
				className="inline-flex h-8 items-center gap-2 rounded-[--radius-sm] border border-edge bg-transparent px-3 font-medium text-ink text-sm transition-colors hover:bg-surface-2"
			>
				<Home className="size-4" />
				Go home
			</Link>
		</div>
	)
}
