import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Shows the browser's native "unsaved changes" confirmation dialog
 * when navigating away (both client-side routing and tab close/refresh).
 */
export function useUnsavedChanges(dirty: boolean) {
	// Client-side navigation (react-router)
	const blocker = useBlocker(dirty)

	useEffect(() => {
		if (blocker.state === 'blocked') {
			const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?')
			if (confirmed) {
				blocker.proceed()
			} else {
				blocker.reset()
			}
		}
	}, [blocker])

	// Browser navigation (tab close, refresh, URL bar)
	useEffect(() => {
		if (!dirty) return
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault()
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [dirty])
}
