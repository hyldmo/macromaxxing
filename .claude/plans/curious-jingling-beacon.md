# Replace Timer State Management with Zustand Store

## Context

The workout session timer has state split across 3 sources (RestTimerContext, useTimerState reducer, WorkoutSessionPage parent state) that must stay in sync on every set confirmation. This causes:
- Rest timer showing the **next** set instead of the one just completed (cursor advances before timer starts)
- Exiting TimerMode puts you on a random set (reducer state re-initializes from stale query cache)
- Ref-based semaphores (`timerModeActiveRef`, `transitionQueueRef`, `logIdCallbackRef`) to coordinate the 3 sources

**Solution:** Single Zustand store owns all workout session state. Both checklist mode and timer mode read/write the same store. Query cache is for server persistence only.

## Store Shape

```ts
interface WorkoutSessionStore {
  sessionId: string | null
  sessionStartedAt: number | null

  queue: FlatSet[]
  confirmedIndices: number[]

  active: {
    index: number
    weight: number | null
    reps: number
    logId: string | null
    setTimer: { startedAt: number; isPaused: boolean } | null
  } | null                    // null = all done

  rest: {
    startedAt: number         // superset: from first exercise in round
    endAt: number
    total: number
    setType: SetType
  } | null                    // null = not resting

  _roundStartedAt: number | null  // internal: superset round timing
}
```

## Key Design Decisions

**Cursor does NOT advance on confirm.** `confirmSet()` keeps `active.index` on the just-completed set so the user can edit weight/reps during rest. Only `dismissRest()` advances to the next set. This fixes the "shows next set" bug.

**Checklist mode skips the cursor.** Checklist confirms arbitrary sets via `addSetMutation` directly, then calls `store.startRest()` for the nav widget. Only timer mode uses `confirmSet()`/`dismissRest()`.

**Superset rest starts on first exercise.** After A1: `_roundStartedAt` is recorded, cursor advances immediately to B1, set timer auto-starts. After B1 (last in round): `rest.endAt = _roundStartedAt + fullDuration`, so the countdown shows what's left. No `recordTransition` concept — just one timestamp.

**Notifications via store subscriber.** A `setTimeout` subscriber fires vibrate + service worker notification when `rest.endAt` is reached. Keeps store pure and testable.

## Actions

| Action | Behavior |
|--------|----------|
| `init(sessionId, startedAt, sets)` | Hydrate queue, find first pending, set `active` |
| `confirmSet()` → `MutationData` | Mark confirmed, start rest (or record `_roundStartedAt` for transition + auto-advance + auto-start next set timer). Returns `{ exerciseId, weightKg, reps, setType }` for mutation |
| `startRest(duration, setType)` | Public rest start for checklist mode. Subtracts elapsed `_roundStartedAt` time |
| `dismissRest()` | Clear rest, advance cursor to next pending, load planned values |
| `setLogId(id)` | Set `active.logId` — enables post-confirm edits during rest |
| `undo()` | Pop last confirmed, restore cursor, clear rest |
| `editWeight(w)` / `editReps(r)` | Update `active.weight` / `active.reps` |
| `startSet()` / `pauseSet()` / `resumeSet(elapsedMs)` / `stopSet()` | Set timer control |
| `navigate(direction)` | Jump to next/prev exercise group (by `itemIndex`) |
| `reset()` | Clear all state (session end / unmount) |

## Mutation Connection

```
Timer mode:    store.confirmSet() → returns data → addSetMutation.mutate(data)
Checklist mode: addSetMutation.mutate(data) → onSuccess → store.startRest(duration, setType)
Both:          onSuccess → store.setLogId(realId)
               onError   → store.undo() + rollback query cache
```

## File Changes

### New files
- `src/features/workouts/store/useWorkoutSessionStore.ts` — Zustand store
- `src/features/workouts/store/restNotifications.ts` — subscriber for vibrate/notification
- `src/features/workouts/store/index.ts` — barrel export
- `src/features/workouts/hooks/useTimerTick.ts` — RAF hook returning `setElapsedMs` + `restRemaining` from store timestamps

### Modified files
- `src/components/layout/RootLayout.tsx` — remove `RestTimerProvider`, add notification subscriber setup
- `src/features/workouts/WorkoutSessionPage.tsx` — remove refs (`timerModeActiveRef`, `transitionQueueRef`, `logIdCallbackRef`), simplify `addSetMutation.onSuccess`, shrink outlet context
- `src/features/workouts/components/TimerMode.tsx` — read from store, remove reducer/context usage
- `src/features/workouts/components/RestTimer.tsx` — read from store instead of context
- `src/features/workouts/components/SecondaryTimer.tsx` — read `_roundStartedAt` from store
- `src/features/workouts/components/SupersetForm.tsx` — call `store.startRest()` instead of parent callback for transition
- `src/features/workouts/components/SessionReview.tsx` — `store.reset()` instead of `setSession(null)`

### Deleted files
- `src/features/workouts/RestTimerContext.tsx`
- `src/features/workouts/hooks/useTimerState.ts`

## Implementation Order

### Step 1: Create store with rest timer only
1. `yarn add zustand`
2. Create store with session identity + rest state + `startRest`/`dismissRest`/`reset`
3. Create notification subscriber
4. Update `RootLayout.tsx` — remove `RestTimerProvider`, init subscriber
5. Update `RestTimer.tsx` nav widget — read from store
6. Update `WorkoutSessionPage.tsx` — replace `useRestTimer()` with store calls
7. Update `SessionReview.tsx` — `store.reset()`
8. Delete `RestTimerContext.tsx`
9. Verify: checklist mode works, nav timer works, notifications fire

### Step 2: Add set queue + timer mode state
1. Add `queue`, `confirmedIndices`, `active`, set timer actions to store
2. Add `confirmSet`, `dismissRest` cursor logic, `navigate`, `undo`
3. Update `TimerMode.tsx` — read from store, remove reducer + outlet context timer fields
4. Shrink outlet context in `WorkoutSessionPage.tsx` — remove refs
5. Delete `useTimerState.ts`
6. Verify: timer mode works, cursor stays on confirmed set during rest, exit preserves position

### Step 3: Cleanup
1. Extract `useTimerTick` hook (RAF for display) if shared between TimerMode and RestTimer
2. Minimize outlet context (TimerMode may still need `exerciseGroups` + `getRestDuration` + mutation callbacks)
3. Consider extracting `useWorkoutMutations(sessionId)` hook

## Verification

1. **Checklist mode:** Confirm a set → rest timer appears in nav → dismiss → timer clears
2. **Timer mode basic:** Start set → Done → rest countdown shows with set just completed → Next Set → cursor advances
3. **Superset flow:** Confirm A1 → no visible rest, cursor moves to B1, set timer starts → Confirm B1 → rest countdown (started from A1 completion time) → Next Set → A2
4. **Post-confirm edit:** During rest, change weight → mutation fires with correct logId
5. **Undo:** During rest, tap undo → set unconfirmed, rest cleared, cursor back
6. **Exit/enter timer mode:** Confirm 3 sets in timer mode → exit → re-enter → still on set 4
7. **Nav widget:** Rest timer visible on any page during active session
8. **Notifications:** Rest timer reaches 0 → vibrate + notification
9. **Session complete:** Complete session → store resets, nav widget clears
10. `yarn typecheck && yarn test && yarn build` pass
