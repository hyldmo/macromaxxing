# Timer Mode: Route-Based Navigation + Nav Elapsed Display

## Context

Timer mode is currently a state-toggled overlay inside WorkoutSessionPage. Issues:
- "Start workout timer" button shows even while timer runs
- No quick way to get back to timer after closing it
- Nav RestTimer only shows a dumbbell icon when session active (no elapsed time)

User wants: timer as a route (easier nav), nav showing elapsed time (click to re-open timer), Outlet-based rendering in session page.

## Architecture

### Route structure
```
/workouts/sessions/:sessionId           → WorkoutSessionPage (has <Outlet>)
/workouts/sessions/:sessionId/timer     → TimerMode (child route, renders in Outlet)
```

Timer is a child route — renders inside WorkoutSessionPage's Outlet with `fixed inset-0` (same full-screen overlay behavior). Parent page still renders behind it but is covered.

### Nav elapsed timer
RestTimer component shows session elapsed time when session is active + no rest countdown. Clicking navigates to the timer route.

## File Changes

### 1. `src/features/workouts/RestTimerContext.tsx`
- Add `startedAt: number | null` to state
- Change `setSessionId(id)` → `setSession(session: { id: string; startedAt: number } | null)` — stores both session ID and start timestamp
- Export `startedAt` in context value

### 2. `src/features/workouts/components/RestTimer.tsx`
- **Timer running** → keep existing countdown display, but navigate to `/workouts/sessions/${sessionId}/timer` instead of just the session
- **Session active, no timer** → show elapsed time (`formatElapsed(Date.now() - startedAt)`) with 1-second interval, clicking navigates to timer route
- **Idle** → null (unchanged)

### 3. `src/router.tsx`
- Add child route under `workouts/sessions/:sessionId`:
```tsx
{
  path: 'workouts/sessions/:sessionId',
  element: <WorkoutSessionPage />,
  children: [
    { path: 'timer', element: <TimerMode /> }
  ]
}
```

### 4. `src/features/workouts/WorkoutSessionPage.tsx`
- Remove `timerMode` state
- Replace `setSessionId(session.id)` with `setSession({ id: session.id, startedAt: session.startedAt })`
- Replace "Start workout timer" button with `<LinkButton to="timer">` (existing component from `~/components/ui/Button`)
- Replace inline `<TimerMode>` with `<Outlet context={timerContext} />`, passing:
  - `exerciseGroups`, `session`, `onConfirmSet`, `setActiveExerciseId`

### 5. `src/features/workouts/components/TimerMode.tsx`
- Remove `open` prop — always renders when route matches
- Use `useOutletContext()` to get data instead of props
- Replace `onClose` with `useNavigate()` → `navigate('..')`
- Keep all 3-state set flow logic (already implemented)

## Verification

1. Navigate to session page → nav shows elapsed time with dumbbell
2. Click nav elapsed → navigates to `/sessions/:id/timer`, full-screen timer opens
3. Close timer (X or Escape) → navigates back to session page, nav still shows elapsed
4. Click "Timer" button on session page → same as nav click
5. Complete a set → rest timer starts, nav shows countdown instead of elapsed
6. Rest timer expires → nav switches back to elapsed
7. Navigate away from session → nav elapsed still visible, clickable
8. Browser back from timer → returns to session page
