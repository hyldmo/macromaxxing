# Replace Timer State Management with Zustand Store

## Context

The workout session timer has state split across 3 sources (RestTimerContext, useTimerState reducer, WorkoutSessionPage parent state) that must stay in sync on every set confirmation. This causes:
- Rest timer showing the **next** set instead of the one just completed (cursor advances before timer starts)
- Exiting TimerMode puts you on a random set (reducer state re-initializes from stale query cache)
- Ref-based semaphores (`timerModeActiveRef`, `transitionQueueRef`, `logIdCallbackRef`) to coordinate the 3 sources

**Solution:** Single Zustand store owns all workout session state. Both checklist mode and timer mode read/write the same store. Query cache is for server persistence only.

## Architecture

```
┌────────────────────────────────────────────────┐
│        useWorkoutSessionStore (Zustand)         │
│  Module singleton — no provider needed          │
│                                                 │
│  sessionId, queue, confirmedIndices,            │
│  active: { index, weight, reps, logId, timer }, │
│  rest: { startedAt, endAt, total, setType },   │
│  _roundStartedAt                                │
│                                                 │
│  confirmSet() → keeps cursor, starts rest       │
│  dismissRest() → advances cursor                │
└──┬─────────────────┬────────────────┬──────────┘
   │                 │                │
RestTimer     SessionPage        TimerMode
(reads rest   (startRest()      (confirmSet()
 + session)    from onSuccess)   dismissRest())
```

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
    startedAt: number         // superset: backdated to _roundStartedAt
    endAt: number
    total: number
    setType: SetType
  } | null                    // null = not resting

  _roundStartedAt: number | null  // internal: superset round timing
}
```

## Key Design Decisions

1. **Cursor does NOT advance on confirm.** `confirmSet()` keeps `active.index` on the just-completed set so the user can edit weight/reps during rest. Only `dismissRest()` advances to the next set. This fixes the "shows next set" bug.

2. **Checklist mode skips the cursor.** Checklist confirms arbitrary sets via `addSetMutation` directly, then calls `store.startRest()` for the nav widget. Only timer mode uses `confirmSet()`/`dismissRest()`.

3. **Superset rest backdates startedAt.** After A1: `_roundStartedAt` is recorded, cursor advances immediately to B1, set timer auto-starts. After B1 (last in round): `rest.startedAt = _roundStartedAt`, so the countdown shows remaining time from when the round started. No subtraction math.

4. **Mutations stay in WorkoutSessionPage.** Store is pure client state. `confirmSet()` returns `{ exerciseId, weightKg, reps, setType }` and the caller fires the mutation. TimerMode calls store action then parent callback (thin outlet context — just mutation triggers, no refs).

5. **WorkoutSessionPage calls init() once** when session data first loads. No re-sync on exerciseGroups changes (set mode overrides, added exercises happen in checklist mode which doesn't use the cursor).

6. **Notifications self-subscribe in store module.** A `subscribe()` call at module level fires vibrate + service worker notification when `rest.endAt` is reached. No React involvement, no separate file.

7. **SessionReview has no store dependency.** `completeSession.onSuccess` in WorkoutSessionPage calls `store.reset()`. SessionReview just fires the mutation and closes.

## Actions

| Action | Behavior |
|--------|----------|
| `init(sessionId, startedAt, sets)` | Hydrate queue, find first pending, set `active` |
| `confirmSet()` → `MutationData` | Mark confirmed, start rest (or record `_roundStartedAt` for transition + auto-advance + auto-start next set timer). Returns `{ exerciseId, weightKg, reps, setType }` for mutation |
| `startRest(duration, setType)` | Public rest start for checklist mode. Backdates if `_roundStartedAt` exists |
| `dismissRest()` | Clear rest, advance cursor to next pending, load planned values |
| `setLogId(id)` | Set `active.logId` — enables post-confirm edits during rest |
| `undo()` | Pop last confirmed, restore cursor, clear rest |
| `editWeight(w)` / `editReps(r)` | Update `active.weight` / `active.reps` |
| `startSet()` / `pauseSet()` / `resumeSet(elapsedMs)` / `stopSet()` | Set timer control |
| `navigate(direction)` | Jump to next/prev exercise group (by `itemIndex`) |
| `reset()` | Clear all state (session end / unmount) |

## Mutation Connection

```
Timer mode:     store.confirmSet() → returns data → addSetMutation.mutate(data)
Checklist mode: addSetMutation.mutate(data) → onSuccess → store.startRest(duration, setType)
Both:           onSuccess → store.setLogId(realId)
                onError   → store.undo() + rollback query cache
Undo:           store.undo() + removeSetMutation.mutate(lastLogId)
Complete:       completeSession.onSuccess → store.reset()
```

## File Changes

### New files
- `src/features/workouts/store/useWorkoutSessionStore.ts` — Zustand store + self-subscribing notification logic
- `src/features/workouts/store/useWorkoutSessionStore.test.ts` — Unit tests (T1-T25, see test plan below)
- `src/features/workouts/store/index.ts` — barrel export
- `src/features/workouts/hooks/useWorkoutMutations.ts` — extracted addSet/updateSet/removeSet mutations from WorkoutSessionPage
- `src/lib/workouts/constants.ts` — shared `SET_TYPE_STYLES` constant (deduplicated from 4 files)

### Modified files
- `src/components/layout/RootLayout.tsx` — remove `RestTimerProvider` wrapper
- `src/features/workouts/WorkoutSessionPage.tsx` — remove refs, call `store.init()` on session load, extract mutations to hook, simplify outlet context
- `src/features/workouts/components/TimerMode.tsx` — read from store, remove reducer/context usage, import SET_TYPE_STYLES from shared constant
- `src/features/workouts/components/RestTimer.tsx` — read from store instead of context, import SET_TYPE_STYLES
- `src/features/workouts/components/SecondaryTimer.tsx` — read `_roundStartedAt` from store
- `src/features/workouts/components/SupersetForm.tsx` — call `store.startRest()` instead of parent callback for transition
- `src/features/workouts/components/SetRow.tsx` — import SET_TYPE_STYLES from shared constant
- `src/features/workouts/components/TimerRing.tsx` — import SET_TYPE_COLORS from shared constant

### Deleted files
- `src/features/workouts/RestTimerContext.tsx`
- `src/features/workouts/hooks/useTimerState.ts`

## Implementation Order

### Step 1: Prep work
1. `yarn add zustand`
2. Extract `SET_TYPE_STYLES` to `src/lib/workouts/constants.ts`, update imports in SetRow.tsx, TimerRing.tsx, RestTimer.tsx, TimerMode.tsx
3. Verify: `yarn typecheck && yarn build`

### Step 2: Create store with rest timer only
1. Create `src/features/workouts/store/useWorkoutSessionStore.ts` with session identity + rest state + `startRest`/`dismissRest`/`reset` + notification subscriber
2. Create `src/features/workouts/store/index.ts` barrel export
3. Update `RootLayout.tsx` — remove `RestTimerProvider`
4. Update `RestTimer.tsx` nav widget — read from store
5. Update `WorkoutSessionPage.tsx` — replace `useRestTimer()` with store calls
6. Remove `useRestTimer()` import from `SessionReview.tsx` (parent handles cleanup via `completeSession.onSuccess` → `store.reset()`)
7. Delete `RestTimerContext.tsx`
8. Verify: checklist mode works, nav timer works, notifications fire

### Step 3: Add set queue + timer mode state
1. Add `queue`, `confirmedIndices`, `active`, set timer actions to store
2. Add `confirmSet`, `dismissRest` cursor logic, `navigate`, `undo`
3. Call `store.init()` from `WorkoutSessionPage.tsx` when session data loads
4. Update `TimerMode.tsx` — read from store, remove reducer + outlet context timer fields
5. Update `SecondaryTimer.tsx` — read `_roundStartedAt` from store
6. Shrink outlet context in `WorkoutSessionPage.tsx` — remove refs (`timerModeActiveRef`, `transitionQueueRef`, `logIdCallbackRef`)
7. Delete `useTimerState.ts`
8. Verify: timer mode works, cursor stays on confirmed set during rest, exit preserves position

### Step 4: Extract mutations + tests
1. Extract `useWorkoutMutations(sessionId)` hook from WorkoutSessionPage
2. Write unit tests for store (T1-T25)
3. Minimize outlet context (TimerMode needs `exerciseGroups` + `getRestDuration` + mutation callbacks)
4. Verify: `yarn typecheck && yarn test && yarn build`

## Test Plan

Unit tests for store at `src/features/workouts/store/useWorkoutSessionStore.test.ts`:

```
init()
  T1: empty sets → active = null
  T2: some completed → cursor skips to first pending
  T3: all pending → cursor = 0

confirmSet()
  T4: active is null → no-op
  T5: solo exercise → mark confirmed, start rest, keep cursor on confirmed set
  T6: superset mid-round (transition) → set _roundStartedAt, advance cursor, no rest
  T7: superset last-in-round → backdate rest.startedAt to _roundStartedAt
  T8: returns correct { exerciseId, weightKg, reps, setType }

dismissRest()
  T9: rest is null → no-op
  T10: has next pending → advance cursor, load planned values
  T11: no more pending → active = null

startRest() [checklist mode]
  T12: no _roundStartedAt → rest starts now
  T13: has _roundStartedAt → backdates rest.startedAt

undo()
  T14: no confirmed sets → no-op
  T15: has confirmed → pop last, restore cursor, clear rest

editWeight / editReps
  T16: updates active.weight / active.reps

setLogId
  T17: sets active.logId

set timer control
  T18: startSet → sets setTimer.startedAt
  T19: pauseSet → sets isPaused
  T20: resumeSet → adjusts startedAt by elapsed
  T21: stopSet → clears setTimer

navigate
  T22: direction=1 → next exercise group
  T23: direction=-1 → prev exercise group
  T24: no target → no-op

reset
  T25: clears all state
```

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

## Known Limitations

- Store queue is initialized once per session load (decision 3B). If the user changes set modes or adds freeform exercises in checklist mode, the timer queue won't reflect those changes until next session. Exercise replacement is done via modal in checklist mode only, so TimerMode won't see replacements made after init.
- `setLogId()` race with `undo()`: if server responds after user hits undo, logId may be set on wrong set. Accepted — narrow window, pre-existing condition (decision 11C).
