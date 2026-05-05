# Mobile Hamburger Menu + Favorites-Driven Bottom Nav

**Date:** 2026-05-05
**Status:** Draft
**Scope:** `src/components/layout/Nav.tsx` and a small new hook in `src/lib/`.

## Problem

The mobile bottom tab bar has four hardcoded slots (Recipes, Ingredients, Plans, Workouts). Analytics has no slot, Exercises has no slot, and Settings is reachable only via a top-bar icon that gets hidden during an active workout timer. Users can't choose what they actually use most.

## Goals

- Give mobile users a single menu (hamburger) that exposes every navigable surface plus account actions.
- Let signed-in users pin up to 4 items to the bottom tab bar, replacing the hardcoded defaults.
- No backend changes. No DB migration. No new packages.

## Non-Goals

- Cross-device sync of favorites.
- Drag-to-reorder.
- Customizing favorites for signed-out users.
- Changing desktop nav.
- Animations beyond a single slide-in transition.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Hamburger lives top-right of the existing mobile top header | Standard pattern; consolidates settings + profile + nav into one entry point. |
| 2 | Persistence in `localStorage`, not `userSettings` | v1 simplicity. "Which 4 of 7 to pin" is cheap to re-pick on a new device. |
| 3 | All 7 routes are favoritable: Recipes, Ingredients, Plans, Workouts, Analytics, Exercises, Settings | User explicitly chose maximum flexibility. |
| 4 | Auto-replace oldest when a 5th star is tapped | Never blocks the user. |
| 5 | Bottom bar renders favorites in canonical order | Muscle memory; bar shouldn't shuffle. |
| 6 | Brand name "macromaxxing" stays hardcoded inline | Only one render site; not worth a shared constant. |

## Architecture

### Component layout

```
Nav (existing, modified)
├── Desktop top nav  ← unchanged
├── Mobile top header
│   ├── Logo + brand (left)
│   ├── OfflineIndicator + RestTimer (middle-right)
│   └── HamburgerButton (right)  ← new, mobile only, hidden when timerActive
└── Mobile bottom tab bar  ← now driven by useBottomNavFavorites()

MobileMenuDrawer  ← new component, mobile only
├── Backdrop (click to close)
└── Panel (slide-in from right, ~85% width, full height)
    ├── Header row
    │   ├── Brand text (left)
    │   └── UserButton or "Sign in" (right)
    ├── NavItemRow × 7 (signed-in) or × 2 (signed-out)
    │   └── icon + label + StarToggle
    └── Footer hint: "Pick up to 4 to pin to the bottom bar"
```

### State

- New hook: `src/lib/useBottomNavFavorites.ts`
  - Reads/writes `localStorage` key `macromaxxing:bottomNavFavorites` as JSON `string[]`.
  - Stored array is in **insertion order** (used to identify oldest for auto-replace).
  - Subscribes to `window` `storage` event for cross-tab sync.
  - API: `{ favorites: string[], isFavorite(route): boolean, toggle(route): void }`.
  - Default when key missing or invalid: `['/recipes', '/ingredients', '/plans', '/workouts']`.
  - `toggle(route)`: if already starred → remove. Else if `< 4` starred → append. Else → drop index 0 and append.
  - Filter unknown routes at read time (silent prune).

- Drawer open/closed state: local `useState` in `Nav`.

### Canonical order

Source of truth: a single ordered array in `Nav.tsx`:

```ts
const FAVORITABLE_ROUTES: Link[] = [
  { to: '/recipes',     label: 'Recipes',     icon: CookingPot },
  { to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed },
  { to: '/plans',       label: 'Plans',       icon: CalendarDays },
  { to: '/workouts',    label: 'Workouts',    icon: Dumbbell },
  { to: '/exercises',   label: 'Exercises',   icon: BicepsFlexed },
  { to: '/analytics',   label: 'Analytics',   icon: BarChart3 },
  { to: '/settings',    label: 'Settings',    icon: Settings },
]
```

The menu renders this list top-to-bottom. The bottom bar renders this list filtered by `favorites`, in array order.

### Drawer styling

- `fixed inset-0 z-50 md:hidden` wrapper.
- Backdrop: `bg-black/50` with click handler.
- Panel: `bg-surface-1 border-l border-edge w-[85%] max-w-sm h-full ml-auto translate-x-0` (animated from `translate-x-full`).
- Body scroll lock while open.
- ESC key closes; focus trap inside panel; focus restored to hamburger button on close.

## Behavior

- **Tapping a row** navigates and closes the drawer.
- **Tapping the star** toggles favorite without navigating, without closing the drawer.
- **Tapping a 5th star** silently removes the oldest favorite and adds the new one (no toast — the bottom bar updating is its own feedback).
- **Bottom bar with 0 favorites** renders empty; user opens menu and re-picks.
- **Workout timer active on mobile**: hamburger hidden (matches existing pattern of hiding settings/avatar). Drawer not openable until timer ends or session is left.
- **Signed-out**: hamburger hidden. Bottom bar continues to render `[Recipes, Ingredients, SignIn]` as today.

## Edge Cases

| Case | Handling |
|---|---|
| localStorage missing/corrupt JSON | Use defaults; do not write back until user toggles. |
| Stored route no longer exists | Filtered out at read time; bottom bar renders fewer slots. |
| User unstars down to 0 favorites | Bottom bar renders empty (`auto-cols-fr` already handles N items). |
| Two tabs open | `storage` event syncs both tabs' favorites lists. |
| Drawer open when route changes (e.g. via row tap) | `useEffect` on `location.pathname` closes drawer. |

## Files

**New:**
- `src/lib/useBottomNavFavorites.ts`
- `src/components/layout/MobileMenuDrawer.tsx`

**Modified:**
- `src/components/layout/Nav.tsx` — replace `mobileAuthLinks` with favorites-driven render; add hamburger button on mobile; mount `MobileMenuDrawer`. Remove the `Settings` link / `UserButton` cluster from the mobile top header (they move into the drawer).

## Testing

- Manual on a mobile viewport (Chrome devtools, ~iPhone 14 width).
- Unit test for `useBottomNavFavorites`:
  - default when empty
  - toggle add / remove
  - auto-replace oldest at 5th add
  - filters unknown routes on read
  - cross-tab `storage` event update
- No e2e or visual regression tests in v1.

## Risks

- **Drawer focus management** — `<dialog>` is well-supported but has quirks (e.g. backdrop click). Falling back to `role="dialog"` + manual focus trap is fine if `<dialog>` causes issues.
- **localStorage quota** — irrelevant; payload is < 200 bytes.
- **PWA cache of old `Nav.tsx` after deploy** — handled by existing self-heal script in `index.html`.

## Out of scope follow-ups

- Sync favorites to `userSettings` for cross-device persistence.
- Drag-reorder favorites.
- Per-user customization of which routes are favoritable.
- Animation polish (overshoot, spring, etc.).
