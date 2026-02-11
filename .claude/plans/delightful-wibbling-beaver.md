# Fatigue Tiers + Superset Support

## Context

Replace static rest durations with a dynamic formula based on exercise fatigue tier, rep count, and training goal. Add superset grouping so exercises can be interleaved in sessions (A1→B1→rest→A2→B2→rest) with 15s transition timers between superset exercises.

## 1. Schema changes

**`packages/db/custom-types.ts`** — Add FatigueTier type:
```ts
export type FatigueTier = 1 | 2 | 3 | 4
```

**`packages/db/schema.ts`** — Two changes:

Add `fatigueTier` to `exercises` table:
```ts
fatigueTier: integer('fatigue_tier').notNull().default(2).$type<FatigueTier>()
```

Add `supersetGroup` to `workoutExercises` table:
```ts
supersetGroup: integer('superset_group'), // null = standalone, same int = grouped
```

Generate migration. Update seed script to set tier per exercise.

**Tier assignments for seed exercises:**
| Tier | Exercises |
|------|-----------|
| 1 (CNS heavy) | Squat, Deadlift |
| 2 (Compound) | Bench Press, Incline Bench, OHP, Barbell Row, Pull-Up, Romanian Deadlift |
| 3 (Stable) | Face Pull, Cable Fly, Hammer Curl |
| 4 (Isolation) | Lateral Raise, Bicep Curl, Tricep Extension, Leg Curl, Leg Extension, Calf Raise, Rear Delt Fly, Preacher Curl, Wrist Curl |

Default for new exercises: `type === 'compound' ? 2 : 4`

## 2. Dynamic rest calculation

**`src/features/workouts/utils/sets.ts`** — Replace static `TRAINING_DEFAULTS.rest` with:

```ts
const GOAL_MULTIPLIER = { hypertrophy: 1.0, strength: 1.5 } as const
const TIER_MODIFIER = { 1: 60, 2: 30, 3: 0, 4: -15 } as const

export function calculateRest(reps: number, fatigueTier: FatigueTier, goal: TrainingGoal): number {
  return Math.max(15, Math.round(reps * 4 * GOAL_MULTIPLIER[goal] + TIER_MODIFIER[fatigueTier]))
}
```

Keep `TRAINING_DEFAULTS` for sets/reps defaults (remove the `rest` sub-object). Quick-start buttons in `RestTimer.tsx` will use `calculateRest` with sensible defaults.

## 3. Backend changes

**`workers/functions/lib/routes/workouts.ts`**:

- Add `fatigueTier` to `createExercise` input schema (optional, default by type)
- Add `supersetGroup` to exercise input in `createWorkout` / `updateWorkout` (nullable int)
- `inferExercise` returns fatigue tier along with type/muscles
- `getWorkout` / `getSession` already returns all fields via `with` — no query changes needed

## 4. Timer context changes

**`src/features/workouts/RestTimerContext.tsx`** — Session-aware context:

Replace the manually-provided `sessionGoal` / `setSessionGoal` with a single `sessionId`. The context queries the session internally via tRPC and derives everything it needs.

```ts
interface RestTimerState {
  // Timer state
  remaining: number    // positive = counting down, negative = overshot
  total: number
  setType: SetType | null
  isRunning: boolean   // true while timer is active (even when negative)
  // Session awareness
  sessionId: string | null
  // Actions
  setSessionId: (id: string | null) => void
  start: (durationSec: number, setType: SetType) => void
  dismiss: () => void
}
```

- Only stores `sessionId` — no derived state
- `remaining` goes negative after expiry: shows -0:05, -0:30 etc. (how much rest was overshot)
- No `extend()` — simplifies UI to just countdown + dismiss
- Notification + vibrate fires at 0, timer keeps counting negative until dismissed or next set starts
- Session page calls `setSessionId(session.id)` when session loads (if not completed)
- **Does NOT clear on unmount** — timer persists when navigating to other pages
- Only cleared when session is completed (`completeSession.onSuccess` calls `setSessionId(null)`)
- Timer **auto-starts** on set completion: session page calls `start(calculateRest(...), setType)` in `addSetMutation.onSuccess`
- Starting a new timer (next set) implicitly dismisses the previous one
- `sessionId` used for click-to-navigate back to workout from any page

## 5. RestTimer UI update

**`src/features/workouts/components/RestTimer.tsx`**:

Two states:
1. **Counting down** (remaining > 0): `M:SS` display + dismiss ×. Clicking the time navigates to session.
2. **Overshot** (remaining <= 0): `-M:SS` in red/warning color + dismiss ×. Clicking navigates to session.

When no timer is running but `sessionId` is set, show a small session link indicator (e.g., dumbbell icon) — clicking navigates to `/workouts/sessions/${sessionId}`.

No extend button, no quick-start buttons. Timer auto-starts from session page, shows time remaining or overshot, and acts as a nav link back to the workout.

## 6. Superset template UI

**`src/features/workouts/components/TemplateExerciseRow.tsx`** and **`WorkoutTemplatePage.tsx`**:

- Add a "link" icon button between adjacent exercises to toggle superset grouping
- Exercises in the same group get a colored left border + group label ("SS1", "SS2", ...)
- `TemplateExercise` type gains `supersetGroup: number | null`
- When linking: assign the lowest available group number
- When unlinking: set to null
- Pass `supersetGroup` in save payload

## 7. Superset session rendering

**`src/features/workouts/WorkoutSessionPage.tsx`**:

Change `exerciseGroups` from flat list to grouped structure:

```ts
type RenderItem =
  | { type: 'standalone'; exercise: SessionLog['exercise']; logs: SessionLog[]; planned: PlannedSet[] }
  | { type: 'superset'; group: number; exercises: Array<{ exercise: ...; logs: ...; planned: ... }> }
```

In the `useMemo`, after building per-exercise data, group by `supersetGroup`:
- Exercises with same `supersetGroup` → merged into one `RenderItem` of type `superset`
- Standalone exercises → `type: 'standalone'`

Rendering:
- Standalone: render `ExerciseSetForm` as before
- Superset: render new `SupersetForm` component

## 8. SupersetForm component

**`src/features/workouts/components/SupersetForm.tsx`** (new):

A collapsible card similar to `ExerciseSetForm` but containing multiple exercises.

**Header:** "Superset: Bench Press + Bicep Curl" with total sets count and volume.

**Body — interleaved rounds:**

Build rounds from planned sets:
```
Round 1: [A-warmup, B-warmup]
Round 2: [A-working, B-working]
Round 3: [A-working, B-working]
...
```

Each round shows:
- Confirmed sets (from logs) with check marks
- Next unconfirmed set highlighted — user confirms one exercise at a time
- After confirming all exercises in a round:
  - If not last round: suggest full rest via `suggest(calculateRest(...), setType)`
  - 15s transition timer between exercises within a round (auto-start this one)

**Key interaction flow:**
1. User sees round 1: A's warmup set pending
2. Confirms A's set → 15s transition timer auto-starts → B's warmup set highlighted
3. Confirms B's set → full rest timer auto-starts (calculated from heaviest exercise in group)
4. Timer completes → round 2 sets become available

**Standalone exercise flow:**
1. User confirms set → rest timer auto-starts with `calculateRest(reps, exercise.fatigueTier, goal)`
2. Timer shows in nav — clicking it navigates back to session page

**Props:**
```ts
interface SupersetFormProps {
  group: number
  exercises: Array<{
    exercise: Exercise
    logs: SessionLog[]
    plannedSets: PlannedSet[]
    setMode: SetMode
  }>
  onAddSet: (data: { exerciseId; weightKg; reps; setType }) => void
  onUpdateSet: (id, updates) => void
  onRemoveSet: (id) => void
  readOnly?: boolean
}
```

## 9. Transition timer

For the 15s transition within supersets, reuse the existing rest timer:
- Call `start(15, setType)` — short duration distinguishes it visually
- After the last exercise in a round, call `start(calculateRest(...), setType)` for full rest
- Both auto-start — consistent behavior for all set completions

Optional: add `isTransition: boolean` to timer context for distinct label ("Switch to B" vs "Rest").

## Files to modify/create

- `packages/db/custom-types.ts` — `FatigueTier` type
- `packages/db/schema.ts` — `fatigueTier` on exercises, `supersetGroup` on workoutExercises
- `scripts/seed-exercises.ts` — tier assignments per exercise
- `workers/functions/lib/routes/workouts.ts` — fatigueTier in exercise CRUD, supersetGroup in workout CRUD, inferExercise returns tier
- `src/features/workouts/utils/sets.ts` — `calculateRest()` function, remove static rest from TRAINING_DEFAULTS
- `src/features/workouts/RestTimerContext.tsx` — `sessionId`, auto-start on set completion, remove idle quick-start
- `src/features/workouts/components/RestTimer.tsx` — click-to-navigate, remove idle quick-start buttons
- `src/features/workouts/WorkoutTemplatePage.tsx` — supersetGroup in state + save payload
- `src/features/workouts/components/TemplateExerciseRow.tsx` — superset link UI
- `src/features/workouts/WorkoutSessionPage.tsx` — grouped render items, superset grouping logic
- `src/features/workouts/components/SupersetForm.tsx` — **new**: interleaved superset card
- `src/features/workouts/components/ExerciseSetForm.tsx` — pass fatigueTier for rest calculation

## Verification

1. `yarn db:generate` + `yarn db:migrate` + `yarn seed`
2. System exercises have correct fatigue tiers
3. Create workout template → link two exercises as superset → colored border + "SS1" label
4. Unlink → back to standalone
5. Start session with superset template → exercises render as interleaved rounds
6. Confirm set A → 15s transition auto-starts → set B highlighted
7. Confirm set B → full rest timer auto-starts with dynamic duration
8. Standalone: confirm set → rest timer auto-starts based on exercise tier + reps + goal
9. Navigate away from session → click timer in nav → returns to session page
10. Timer completion → notification + vibrate
11. `yarn typecheck && yarn fix` passes
