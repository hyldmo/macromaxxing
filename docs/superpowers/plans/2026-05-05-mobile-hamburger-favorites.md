# Mobile Hamburger Menu + Favorites-Driven Bottom Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-right hamburger menu on mobile that lists every navigable surface and lets signed-in users pin up to 4 favorites to the bottom tab bar (replacing the hardcoded defaults).

**Architecture:** A new `useBottomNavFavorites` hook reads/writes a `localStorage`-backed list (insertion order, max 4, auto-replace oldest). A new `MobileMenuDrawer` component renders the full nav list with inline star toggles. `Nav.tsx` mounts the drawer behind a hamburger button (mobile only, hidden during active workout timer) and renders the bottom tab bar from `favorites` filtered through a canonical-order array. No backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind 4, react-router-dom v7, Vitest (pure-logic tests only — no DOM env configured), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-05-mobile-hamburger-favorites-design.md`

---

## File Plan

| File | Action | Responsibility |
|---|---|---|
| `src/lib/useBottomNavFavorites.ts` | Create | Hook + pure `nextFavorites()` reducer + `parseStoredFavorites()` for read-time validation. |
| `src/lib/useBottomNavFavorites.test.ts` | Create | Unit tests for pure helpers (no DOM). |
| `src/lib/index.ts` | Modify | Re-export the new hook. |
| `src/components/layout/MobileMenuDrawer.tsx` | Create | Slide-in drawer: header (brand + UserButton), nav rows with star toggles, footer hint. |
| `src/components/layout/Nav.tsx` | Modify | Add hamburger button, mount drawer, drive bottom bar from favorites. |

---

## Task 1: Pure favorites helpers + tests

**Files:**
- Create: `src/lib/useBottomNavFavorites.ts` (helpers only — hook added in Task 2)
- Create: `src/lib/useBottomNavFavorites.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/useBottomNavFavorites.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_FAVORITES, FAVORITABLE_ROUTES, nextFavorites, parseStoredFavorites } from './useBottomNavFavorites'

const KNOWN = FAVORITABLE_ROUTES

describe('parseStoredFavorites', () => {
	it('returns DEFAULT_FAVORITES when input is null', () => {
		expect(parseStoredFavorites(null)).toEqual(DEFAULT_FAVORITES)
	})

	it('returns DEFAULT_FAVORITES when JSON is malformed', () => {
		expect(parseStoredFavorites('not json{')).toEqual(DEFAULT_FAVORITES)
	})

	it('returns DEFAULT_FAVORITES when value is not an array', () => {
		expect(parseStoredFavorites('{"a":1}')).toEqual(DEFAULT_FAVORITES)
	})

	it('filters out unknown routes', () => {
		expect(parseStoredFavorites(JSON.stringify(['/recipes', '/nope', '/plans']))).toEqual(['/recipes', '/plans'])
	})

	it('preserves order and dedupes', () => {
		expect(parseStoredFavorites(JSON.stringify(['/plans', '/recipes', '/plans']))).toEqual(['/plans', '/recipes'])
	})

	it('caps at 4 entries (drops trailing extras)', () => {
		const all = KNOWN.map(r => r.to)
		expect(parseStoredFavorites(JSON.stringify(all))).toEqual(all.slice(0, 4))
	})
})

describe('nextFavorites', () => {
	it('adds a new favorite at the end', () => {
		expect(nextFavorites(['/recipes', '/plans'], '/workouts')).toEqual(['/recipes', '/plans', '/workouts'])
	})

	it('removes a favorite that is already present', () => {
		expect(nextFavorites(['/recipes', '/plans', '/workouts'], '/plans')).toEqual(['/recipes', '/workouts'])
	})

	it('drops oldest when adding a 5th', () => {
		const current = ['/recipes', '/ingredients', '/plans', '/workouts']
		expect(nextFavorites(current, '/analytics')).toEqual(['/ingredients', '/plans', '/workouts', '/analytics'])
	})

	it('ignores routes that are not favoritable', () => {
		const current = ['/recipes']
		expect(nextFavorites(current, '/not-a-route')).toEqual(['/recipes'])
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/lib/useBottomNavFavorites`
Expected: FAIL — module `./useBottomNavFavorites` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/useBottomNavFavorites.ts`:

```ts
import { Activity, BarChart3, BicepsFlexed, CalendarDays, CookingPot, Dumbbell, type LucideIcon, Settings, UtensilsCrossed } from 'lucide-react'

export interface FavoritableRoute {
	to: string
	label: string
	icon: LucideIcon
}

/** Canonical order — drives both the menu list and the bottom-bar render order. */
export const FAVORITABLE_ROUTES = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed },
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell },
	{ to: '/exercises', label: 'Exercises', icon: BicepsFlexed },
	{ to: '/analytics', label: 'Analytics', icon: BarChart3 },
	{ to: '/settings', label: 'Settings', icon: Settings }
] as const satisfies readonly FavoritableRoute[]

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

// Hook implementation lives here in Task 2.
```

Add re-export — modify `src/lib/index.ts`:

```ts
export * from './useBottomNavFavorites'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/lib/useBottomNavFavorites`
Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useBottomNavFavorites.ts src/lib/useBottomNavFavorites.test.ts src/lib/index.ts
git commit -m "feat(nav): pure helpers for bottom-nav favorites"
```

---

## Task 2: Hook implementation

**Files:**
- Modify: `src/lib/useBottomNavFavorites.ts` (append hook to file from Task 1)

- [ ] **Step 1: Append the hook to `src/lib/useBottomNavFavorites.ts`**

Add to the bottom of the file:

```ts
import { useCallback, useEffect, useState } from 'react'

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
			const next = nextFavorites(prev, route)
			if (next === prev) return prev
			writeToStorage(next)
			return next
		})
	}, [])

	const isFavorite = useCallback((route: string) => favorites.includes(route), [favorites])

	return { favorites, isFavorite, toggle }
}
```

Move the `import { ... } from 'react'` line up next to the other imports at the top of the file.

- [ ] **Step 2: Verify it compiles and tests still pass**

Run: `yarn check`
Expected: lint + typecheck + test all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useBottomNavFavorites.ts
git commit -m "feat(nav): useBottomNavFavorites hook with localStorage sync"
```

---

## Task 3: MobileMenuDrawer component

**Files:**
- Create: `src/components/layout/MobileMenuDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

Create `src/components/layout/MobileMenuDrawer.tsx`:

```tsx
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { ChefHat, LogIn, Star, X } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn, FAVORITABLE_ROUTES, MAX_FAVORITES, useScrollLock } from '~/lib'

export interface MobileMenuDrawerProps {
	open: boolean
	onClose: () => void
	favorites: string[]
	isFavorite: (route: string) => boolean
	onToggleFavorite: (route: string) => void
}

export const MobileMenuDrawer: FC<MobileMenuDrawerProps> = ({ open, onClose, favorites, isFavorite, onToggleFavorite }) => {
	const location = useLocation()

	// Close on route change (e.g. when a row navigates).
	useEffect(() => {
		if (open) onClose()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname])

	// Close on ESC.
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null
	return <DrawerBody onClose={onClose} favorites={favorites} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />
}

const DrawerBody: FC<Omit<MobileMenuDrawerProps, 'open'>> = ({ onClose, isFavorite, onToggleFavorite }) => {
	useScrollLock()
	return (
		<div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
			<button
				type="button"
				className="absolute inset-0 bg-black/50"
				aria-label="Close menu"
				onClick={onClose}
			/>
			<div className="absolute top-0 right-0 flex h-full w-[85%] max-w-sm flex-col border-edge border-l bg-surface-1">
				<header className="flex items-center justify-between border-edge border-b px-4 py-3">
					<div className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="size-5" />
						<span className="tracking-tight">macromaxxing</span>
					</div>
					<div className="flex items-center gap-2">
						<SignedIn>
							<UserButton />
						</SignedIn>
						<SignedOut>
							<SignInButton mode="modal">
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-ink-muted text-sm transition-colors hover:text-ink"
								>
									<LogIn className="size-4" />
									Sign in
								</button>
							</SignInButton>
						</SignedOut>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close menu"
							className="rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink"
						>
							<X className="size-5" />
						</button>
					</div>
				</header>

				<nav className="flex-1 overflow-y-auto py-2">
					<SignedIn>
						{FAVORITABLE_ROUTES.map(({ to, label, icon: Icon }) => {
							const starred = isFavorite(to)
							return (
								<div key={to} className="flex items-stretch">
									<NavLink
										to={to}
										className="flex flex-1 items-center gap-3 px-4 py-3 current:font-medium current:text-accent text-ink-muted transition-colors hover:text-ink"
									>
										<Icon className="size-5" />
										<span>{label}</span>
									</NavLink>
									<button
										type="button"
										onClick={() => onToggleFavorite(to)}
										aria-label={starred ? `Unpin ${label} from bottom bar` : `Pin ${label} to bottom bar`}
										aria-pressed={starred}
										className={cn(
											'flex w-12 items-center justify-center text-ink-faint transition-colors hover:text-ink',
											starred && 'text-accent'
										)}
									>
										<Star className={cn('size-5', starred && 'fill-current')} />
									</button>
								</div>
							)
						})}
						<p className="px-4 py-3 text-ink-faint text-xs">
							Pin up to {MAX_FAVORITES} to the bottom bar. Picking a 5th replaces the oldest.
						</p>
					</SignedIn>
					<SignedOut>
						{FAVORITABLE_ROUTES.filter(r => r.to === '/recipes' || r.to === '/ingredients').map(({ to, label, icon: Icon }) => (
							<NavLink
								key={to}
								to={to}
								className="flex items-center gap-3 px-4 py-3 current:font-medium current:text-accent text-ink-muted transition-colors hover:text-ink"
							>
								<Icon className="size-5" />
								<span>{label}</span>
							</NavLink>
						))}
					</SignedOut>
				</nav>
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/MobileMenuDrawer.tsx
git commit -m "feat(nav): MobileMenuDrawer component"
```

---

## Task 4: Wire the drawer + favorites into Nav

**Files:**
- Modify: `src/components/layout/Nav.tsx`

- [ ] **Step 1: Replace the contents of `src/components/layout/Nav.tsx`**

Full new file:

```tsx
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { BarChart3, CalendarDays, ChefHat, CookingPot, Dumbbell, LogIn, type LucideIcon, Menu, Settings, UtensilsCrossed } from 'lucide-react'
import { type FC, type HTMLAttributes, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { OfflineIndicator } from '~/components/ui/OfflineIndicator'
import { RestTimer } from '~/features/workouts/components/RestTimer'
import { useWorkoutSessionStore } from '~/features/workouts/store'
import { cn, FAVORITABLE_ROUTES, useBottomNavFavorites } from '~/lib'
import { MobileMenuDrawer } from './MobileMenuDrawer'

const publicLinks = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed }
] satisfies Link[]

const desktopAuthLinks = [
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell },
	{ to: '/analytics', label: 'Analytics', icon: BarChart3 }
] satisfies Link[]

export interface Link {
	to: string
	label: string
	icon: LucideIcon
	end?: boolean
}

export function Nav() {
	const timerActive = useWorkoutSessionStore(s => s.sessionStartedAt !== null)
	const { favorites, isFavorite, toggle } = useBottomNavFavorites()
	const [menuOpen, setMenuOpen] = useState(false)

	// Bottom bar = canonical order filtered by favorites.
	const mobileFavLinks: Link[] = FAVORITABLE_ROUTES.filter(r => favorites.includes(r.to)).map(r => ({
		to: r.to,
		label: r.label,
		icon: r.icon
	}))

	return (
		<>
			{/* Top nav (desktop full, mobile collapsed to brand + status + hamburger) */}
			<nav className="sticky top-0 z-50 border-edge border-b bg-surface-1">
				<div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
					<NavLink to="/" className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="size-5" />
						<span className="tracking-tight">macromaxxing</span>
					</NavLink>
					<div className="hidden flex-1 md:flex">
						{publicLinks.map(props => (
							<WebLink key={props.to} {...props} />
						))}
						<SignedIn>
							{desktopAuthLinks.map(props => (
								<WebLink key={props.to} {...props} />
							))}
						</SignedIn>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<OfflineIndicator />
						<RestTimer />
						{/* Desktop-only: settings + avatar inline. */}
						<div className="hidden items-center gap-2 md:flex">
							<SignedIn>
								<WebLink to="/settings" icon={Settings} />
								<UserButton />
							</SignedIn>
							<SignedOut>
								<SignInButton mode="modal">
									<WebLink icon={LogIn} label="Sign in" />
								</SignInButton>
							</SignedOut>
						</div>
						{/* Mobile-only hamburger. Hidden during active workout timer to keep RestTimer focused. */}
						<SignedIn>
							<button
								type="button"
								onClick={() => setMenuOpen(true)}
								aria-label="Open menu"
								aria-expanded={menuOpen}
								className={cn(
									'rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink md:hidden',
									timerActive && 'hidden'
								)}
							>
								<Menu className="size-5" />
							</button>
						</SignedIn>
						<SignedOut>
							<SignInButton mode="modal">
								<button
									type="button"
									aria-label="Sign in"
									className="rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink md:hidden"
								>
									<LogIn className="size-5" />
								</button>
							</SignInButton>
						</SignedOut>
					</div>
				</div>
			</nav>

			{/* Mobile bottom tab bar */}
			<nav className="fixed right-0 bottom-0 left-0 z-50 border-edge border-t bg-surface-1 md:hidden">
				<div className="grid auto-cols-fr grid-flow-col justify-center px-3 2xs:py-1">
					<SignedIn>
						<AppLinks links={mobileFavLinks} />
					</SignedIn>
					<SignedOut>
						<AppLinks links={publicLinks} />
						<SignInButton mode="modal">
							<AppLink icon={LogIn} label="Sign in" />
						</SignInButton>
					</SignedOut>
				</div>
			</nav>

			<MobileMenuDrawer
				open={menuOpen}
				onClose={() => setMenuOpen(false)}
				favorites={favorites}
				isFavorite={isFavorite}
				onToggleFavorite={toggle}
			/>
		</>
	)
}

interface LinkProps {
	className?: string
	to?: string | (() => void)
	label?: string
	icon: LucideIcon
	end?: boolean
}

const WebLink: FC<LinkProps> = ({ to, label, icon: Icon, className, end, ...rest }) => {
	const Elem =
		typeof to === 'string'
			? (props: HTMLAttributes<HTMLAnchorElement>) => <NavLink to={to} end={end} {...props} />
			: (props: HTMLAttributes<HTMLButtonElement>) => <button type="button" onClick={to} {...props} />
	return (
		<Elem
			{...rest}
			className={cn(
				'group flex items-center gap-1.5 rounded-sm px-3 py-1.5 current:font-medium current:text-accent text-ink-muted text-sm transition-colors hover:text-ink',
				className
			)}
		>
			<Icon className="size-5" />
			<span className="group-hover:inline max-md:hidden">{label}</span>
		</Elem>
	)
}

const AppLink: FC<LinkProps> = ({ to, label, icon: Icon, className, end, ...rest }) => {
	const Elem =
		typeof to === 'string'
			? (props: HTMLAttributes<HTMLAnchorElement>) => <NavLink to={to} end={end} {...props} />
			: (props: HTMLAttributes<HTMLButtonElement>) => <button type="button" onClick={to} {...props} />
	return (
		<Elem
			{...rest}
			className={cn(
				'mx-auto space-y-0.5 py-2 text-center current:font-medium 2xs:text-sm current:text-accent text-ink-muted text-xs transition-colors',
				className
			)}
		>
			<Icon className="mx-auto 2xs:size-6 size-5" />
			<div>{label}</div>
		</Elem>
	)
}

const AppLinks: FC<{ links: Link[] }> = ({ links }) => links.map(link => <AppLink key={link.to} {...link} />)
```

Notes on the rewrite vs original:
- `mobileAuthLinks` is gone. `mobileFavLinks` is derived from `FAVORITABLE_ROUTES` filtered by `favorites`.
- The original `<div className={cn('flex items-center gap-2', timerActive && 'max-md:hidden')}>` wrapper around `SignedIn` / `SignedOut` is split into a desktop-only inline cluster (`hidden md:flex`) and a mobile-only hamburger. Same end result on desktop, mobile now routes through the drawer.
- Bottom bar: signed-in renders favorites; signed-out unchanged (Recipes / Ingredients / Sign in).

- [ ] **Step 2: Run all checks**

Run: `yarn check`
Expected: lint + typecheck + test all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Nav.tsx
git commit -m "feat(nav): mobile hamburger drawer with favorites-driven bottom bar"
```

---

## Task 5: Manual QA on a mobile viewport

This is a UI change — `yarn check` doesn't validate it works. Use a browser at mobile width.

- [ ] **Step 1: Start dev**

Run: `yarn dev`
Wait for `http://localhost:1337` to be ready.

- [ ] **Step 2: Open Chrome devtools, set device to "iPhone 14 Pro" (or any width <768px), sign in**

- [ ] **Step 3: Verify the golden path**

  - Top-right shows a hamburger button. Tapping it slides in the drawer from the right.
  - Drawer header shows "macromaxxing" + UserButton avatar + close X.
  - Drawer lists all 7 routes with stars on the right. The 4 default routes (Recipes, Ingredients, Plans, Workouts) are filled.
  - Tapping a row navigates and closes the drawer.
  - Tapping a star toggles fill without navigating, without closing.
  - Bottom bar updates to match the starred set in canonical order.

- [ ] **Step 4: Verify auto-replace**

  - With 4 stars filled, tap a 5th star (e.g. Analytics). The earliest-added star (Recipes if defaults are untouched) unstars; Analytics fills.
  - Bottom bar reflects the new set.

- [ ] **Step 5: Verify edge behaviors**

  - Unstar all 4 → bottom bar renders empty (no crash, grid still spans width).
  - Reload the page → favorites persist.
  - Open a second tab on the same origin, change favorites in one tab → other tab updates within ~1s (storage event).
  - Press ESC while drawer is open → drawer closes.
  - Tap backdrop → drawer closes.
  - Start a workout session → on mobile, hamburger button hides while timer is active. End the session → hamburger returns.

- [ ] **Step 6: Verify desktop is unchanged**

  - Resize to desktop width (≥768px). Top nav looks identical to before (logo + links + status + settings + avatar). No hamburger. No drawer.

- [ ] **Step 7: Verify signed-out state**

  - Sign out. On mobile: top-right shows a sign-in icon (no hamburger). Bottom bar shows Recipes / Ingredients / Sign in. On desktop: unchanged.

- [ ] **Step 8: If any step fails, fix and re-run `yarn check` + the failing manual step. Commit fixes individually.**

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| Hamburger top-right, mobile only, hidden when timerActive | Task 4 |
| Slide-in drawer from right, ~85% width, backdrop, ESC, scroll lock | Task 3 |
| Header: brand + UserButton (signed-in) / Sign in (signed-out) | Task 3 |
| 7 favoritable routes, canonical order | Task 1 |
| Star toggle inline, auto-replace oldest at cap | Task 1 (logic), Task 3 (UI) |
| Footer hint "Pick up to 4..." | Task 3 |
| Signed-out: list shows public items only, no stars | Task 3 |
| `localStorage` key `macromaxxing:bottomNavFavorites` | Task 1 |
| `useBottomNavFavorites` hook with cross-tab `storage` sync | Task 2 |
| Default `['/recipes', '/ingredients', '/plans', '/workouts']` | Task 1 |
| Bottom bar = canonical-order filter | Task 4 |
| Filter unknown stored routes at read time | Task 1 |
| Empty bottom bar when 0 favorites | Task 4 (no special-case needed; grid handles N items) |
| `dialog` semantics + ESC | Task 3 |

**Placeholder scan:** None.

**Type consistency:** `FavoritableRoute`, `useBottomNavFavorites`, `MobileMenuDrawerProps` names match across tasks. `MAX_FAVORITES`, `STORAGE_KEY`, `DEFAULT_FAVORITES` consistent.

---
