import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { Button } from './Button'

const POLL_INTERVAL = 60_000
// If the prompt reappears within this window of clicking "Update", the update
// didn't take (activation failed, or the browser immediately re-detected a
// waiting worker). Suppress it once so a failed update can't tight-loop:
// update -> reload -> prompt -> update. sessionStorage (not localStorage) so a
// genuine update in a later session still prompts normally.
const UPDATE_RETRY_WINDOW = 10_000
const UPDATE_ATTEMPT_KEY = 'pwa-update-attempted-at'

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

	useEffect(() => {
		if (!needRefresh) return
		const attemptedAt = Number(sessionStorage.getItem(UPDATE_ATTEMPT_KEY))
		sessionStorage.removeItem(UPDATE_ATTEMPT_KEY)
		if (attemptedAt && Date.now() - attemptedAt < UPDATE_RETRY_WINDOW) setNeedRefresh(false)
	}, [needRefresh, setNeedRefresh])

	const handleUpdate = () => {
		sessionStorage.setItem(UPDATE_ATTEMPT_KEY, String(Date.now()))
		updateServiceWorker(true)
	}

	if (!needRefresh) return null

	return (
		<div className="fixed right-4 bottom-16 left-4 z-50 flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-1 px-4 py-3 md:right-4 md:bottom-4 md:left-auto md:w-80">
			<span className="text-ink text-sm">New version available</span>
			<div className="flex gap-2">
				<Button variant="outline" size="sm" onClick={() => setNeedRefresh(false)}>
					Dismiss
				</Button>
				<Button size="sm" onClick={handleUpdate}>
					Update
				</Button>
			</div>
		</div>
	)
}
