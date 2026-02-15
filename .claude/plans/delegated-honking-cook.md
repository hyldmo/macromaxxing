# PWA Support with Offline Workouts

## Context

Gyms have poor wifi. The app needs to work offline during workout sessions — loading previously-fetched workout data and logging sets without network connectivity, syncing when back online. Secondary goal: make the app installable as a PWA.

## Approach

Three layers, each delivering incremental value:

1. **Service worker + manifest** → installable app, precached shell loads offline
2. **React Query persistence** → cached data survives reload/offline via IndexedDB
3. **Optimistic mutations** → workout sets log instantly, sync when online

**Key decision:** API caching happens in React Query (IndexedDB), NOT in the service worker. tRPC uses POST for all requests (queries AND mutations via `httpBatchLink`), which makes Workbox runtime caching unreliable. The service worker only precaches static assets (JS/CSS/HTML/icons).

---

## Steps

### 1. Install dependencies

```
yarn add vite-plugin-pwa idb-keyval @tanstack/query-persist-client-core
yarn add -D @vite-pwa/assets-generator sharp
```

### 2. Generate PWA icons

Add script to `package.json`:
```json
"pwa:generate-icons": "pwa-assets-generator --preset minimal-2023 public/favicon.svg"
```

Run it to generate `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png` into `public/`.

### 3. Configure `vite-plugin-pwa` in `vite.config.ts`

- Add `VitePWA` plugin with `registerType: 'autoUpdate'`
- Manifest: name, icons, theme_color, display: standalone
- Workbox: precache `**/*.{js,css,html,ico,png,svg,woff2}`
- `navigateFallback: '/index.html'` for SPA offline navigation
- `navigateFallbackDenylist: [/^\/api\//]` to skip API routes

### 4. Update `index.html`

Add:
- `<meta name="theme-color" content="...">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`

(`vite-plugin-pwa` auto-injects the manifest link)

### 5. Set up React Query persistence

**New file: `src/lib/query-persist.ts`**
- IndexedDB persister using `idb-keyval` (1KB, async, no storage limits)

**Modify: `src/main.tsx`**
- `QueryClient` defaults: `gcTime: 24h`, `staleTime: 5min`, `networkMode: 'offlineFirst'`
- Call `persistQueryClient()` to wire up IndexedDB restore/subscribe
- `networkMode: 'offlineFirst'` on mutations → mutations fire immediately, pause if offline, auto-resume on reconnect

### 6. Add optimistic updates for workout mutations

**Modify: `src/features/workouts/WorkoutSessionPage.tsx`**

Add `onMutate` / `onError` / `onSettled` to three mutations:

- **`addSet`**: Optimistically append set with temp ID (`wkl_temp_${Date.now()}`), rollback on error. Keep existing `onSuccess` timer logic.
- **`updateSet`**: Optimistically patch the matching log in cache
- **`removeSet`**: Optimistically filter out the log from cache

Pattern (already used in `WorkoutListPage.tsx` line 31-43):
```
onMutate: cancel query → save previous → setData optimistically → return { previous }
onError: restore previous
onSettled: invalidate (syncs real data when online)
```

### 7. Add offline indicator to Nav

**New file: `src/components/ui/OfflineIndicator.tsx`**
- Uses `useSyncExternalStore` with `online`/`offline` events
- Shows small pill with WifiOff icon only when offline

**Modify: `src/components/layout/Nav.tsx`**
- Add `<OfflineIndicator />` next to `<RestTimer />` in the `ml-auto` div (line 63)

---

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add deps |
| `vite.config.ts` | Add `VitePWA` plugin |
| `index.html` | theme-color, apple-touch-icon |
| `public/pwa-*.png` | New: generated icons |
| `public/apple-touch-icon-180x180.png` | New: generated icon |
| `src/lib/query-persist.ts` | New: IDB persister |
| `src/main.tsx` | QueryClient config + persistence |
| `src/components/ui/OfflineIndicator.tsx` | New: offline pill |
| `src/components/layout/Nav.tsx` | Add OfflineIndicator |
| `src/features/workouts/WorkoutSessionPage.tsx` | Optimistic updates |

## Verification

1. `yarn build` succeeds, `workers/dist/` contains `sw.js` and `manifest.webmanifest`
2. `yarn dev` → Chrome DevTools → Application → Manifest shows correctly
3. `yarn dev` → Application → Service Workers → registered and active
4. Load `/workouts`, go to a session → DevTools Network → toggle offline → page still shows data
5. While offline, confirm a set → UI updates immediately, mutation shows as paused
6. Toggle back online → mutation fires, data syncs
7. Lighthouse PWA audit passes
