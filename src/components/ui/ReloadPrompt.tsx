import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'

const POLL_INTERVAL = 60_000

export const ReloadPrompt = () => {
	const {
		needRefresh: [needRefresh, setNeedRefresh],
		updateServiceWorker
	} = useRegisterSW({
		onRegisteredSW(_url, registration) {
			if (registration) {
				setInterval(() => registration.update(), POLL_INTERVAL)
			}
		}
	})

	if (!needRefresh) return null

	return (
		<div className="fixed bottom-16 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-1 px-4 py-3 md:bottom-4 md:left-auto md:right-4 md:w-80">
			<span className="text-sm text-ink">New version available</span>
			<div className="flex gap-2">
				<Button variant="outline" size="sm" onClick={() => setNeedRefresh(false)}>
					Dismiss
				</Button>
				<Button size="sm" onClick={() => updateServiceWorker(true)}>
					Update
				</Button>
			</div>
		</div>
	)
}
