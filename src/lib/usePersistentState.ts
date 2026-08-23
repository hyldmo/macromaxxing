import { useCallback, useState } from 'react'

/** Read + validate a JSON value from localStorage. Returns fallback on missing/invalid input. */
export function readStoredValue<T>(key: string, isValid: (v: unknown) => v is T, fallback: T): T {
	if (typeof window === 'undefined') return fallback
	try {
		const raw = window.localStorage.getItem(key)
		if (raw === null) return fallback
		const parsed: unknown = JSON.parse(raw)
		return isValid(parsed) ? parsed : fallback
	} catch {
		return fallback
	}
}

export function writeStoredValue<T>(key: string, value: T): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Quota or privacy mode — the value simply won't persist.
	}
}

/** useState backed by localStorage. Invalid stored values fall back without touching storage. */
export function usePersistentState<T>(
	key: string,
	isValid: (v: unknown) => v is T,
	fallback: T
): [T, (value: T) => void] {
	const [state, setState] = useState<T>(() => readStoredValue(key, isValid, fallback))
	const set = useCallback(
		(value: T) => {
			setState(value)
			writeStoredValue(key, value)
		},
		[key]
	)
	return [state, set]
}
