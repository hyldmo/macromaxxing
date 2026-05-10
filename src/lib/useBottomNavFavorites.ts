import {
	BarChart3,
	BicepsFlexed,
	CalendarDays,
	CookingPot,
	Dumbbell,
	Home,
	type LucideIcon,
	Settings,
	UtensilsCrossed
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export interface FavoritableRoute {
	to: string
	label: string
	icon: LucideIcon
	end?: boolean
}

/** Canonical order — drives both the menu list and the bottom-bar render order. */
export const FAVORITABLE_ROUTES: readonly FavoritableRoute[] = [
	{ to: '/', label: 'Home', icon: Home, end: true },
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed },
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell },
	{ to: '/exercises', label: 'Exercises', icon: BicepsFlexed },
	{ to: '/analytics', label: 'Analytics', icon: BarChart3 },
	{ to: '/settings', label: 'Settings', icon: Settings }
]

export const MAX_FAVORITES = 4
export const STORAGE_KEY = 'macromaxxing:bottomNavFavorites'
export const DEFAULT_FAVORITES: string[] = ['/recipes', '/ingredients', '/plans', '/workouts']

const KNOWN_ROUTES = new Set<string>(FAVORITABLE_ROUTES.map(r => r.to))

const isKnown = (route: string) => KNOWN_ROUTES.has(route)

/** Parse a raw localStorage string. Returns DEFAULT_FAVORITES on null/invalid/empty input. */
export function parseStoredFavorites(raw: string | null): string[] {
	if (raw === null) return DEFAULT_FAVORITES
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return DEFAULT_FAVORITES
	}
	if (!Array.isArray(parsed)) return DEFAULT_FAVORITES
	const seen = new Set<string>()
	const out: string[] = []
	for (const v of parsed) {
		if (typeof v !== 'string') continue
		if (!isKnown(v)) continue
		if (seen.has(v)) continue
		seen.add(v)
		out.push(v)
		if (out.length === MAX_FAVORITES) break
	}
	return out
}

/** Toggle a route in the favorites list. Auto-replaces the oldest entry when adding a (MAX_FAVORITES+1)th. */
export function nextFavorites(current: string[], route: string): string[] {
	if (!isKnown(route)) return current
	if (current.includes(route)) return current.filter(r => r !== route)
	if (current.length < MAX_FAVORITES) return [...current, route]
	return [...current.slice(1), route]
}

function readFromStorage(): string[] {
	if (typeof window === 'undefined') return DEFAULT_FAVORITES
	try {
		return parseStoredFavorites(window.localStorage.getItem(STORAGE_KEY))
	} catch {
		return DEFAULT_FAVORITES
	}
}

function writeToStorage(value: string[]): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
	} catch {
		// Quota or privacy mode — favorites simply won't persist.
	}
}

export interface UseBottomNavFavorites {
	favorites: string[]
	isFavorite: (route: string) => boolean
	toggle: (route: string) => void
}

export function useBottomNavFavorites(): UseBottomNavFavorites {
	const [favorites, setFavorites] = useState<string[]>(readFromStorage)

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key !== STORAGE_KEY) return
			setFavorites(parseStoredFavorites(e.newValue))
		}
		window.addEventListener('storage', onStorage)
		return () => window.removeEventListener('storage', onStorage)
	}, [])

	const toggle = useCallback((route: string) => {
		setFavorites(prev => {
			// nextFavorites returns the same reference for no-ops; the === guard skips redundant writes.
			const next = nextFavorites(prev, route)
			if (next === prev) return prev
			writeToStorage(next)
			return next
		})
	}, [])

	const isFavorite = useCallback((route: string) => favorites.includes(route), [favorites])

	return { favorites, isFavorite, toggle }
}
