import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
	window.addEventListener('online', cb)
	window.addEventListener('offline', cb)
	return () => {
		window.removeEventListener('online', cb)
		window.removeEventListener('offline', cb)
	}
}

const getSnapshot = () => navigator.onLine

export const OfflineIndicator = () => {
	const online = useSyncExternalStore(subscribe, getSnapshot)
	if (online) return null
	return (
		<div className="flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-warning text-xs">
			<WifiOff className="size-3" />
			Offline
		</div>
	)
}
