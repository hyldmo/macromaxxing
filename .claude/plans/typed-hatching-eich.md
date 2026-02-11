# Auto Warmup & Backoff Sets

## Context

Warmup and backoff set generation exists (`generateWarmupSets`, `generateBackoffSets` in `utils/sets.ts`) but is only triggered via manual buttons during a session. Goal: auto-populate planned warmup/backoff sets based on a per-exercise **mode** configured at the template level, with ephemeral session-level overrides.

## Set Mode Design

Single `setMode` enum per exercise: `'working' | 'warmup' | 'backoff' | 'full'`

**Warmup sets don't count** toward `targetSets`. **Backoff consumes 1** from `targetSets`.

| mode | targetSets=3 | result |
|------|-------------|--------|
| `working` | 3 working | 3 total |
| `warmup` | warmup(auto) + 3 working | 3 + warmups |
| `backoff` | 2 working + 1 backoff | 3 total |
| `full` | warmup(auto) + 2 working + 1 backoff | 3 + warmups |

Default: `'warmup'` for compound, `'working'` for isolation (set when adding to template).

## Changes

### 1. Schema — add `setMode` to `workoutExercises`

**File:** `packages/db/schema.ts`

Revert the 3-column edit (includeWarmup/includeBackoff/backoffCount) already in the file. Add single column:
- `setMode` — text, default `'working'`

Delete stale migration `drizzle/20260210142612_gorgeous_payback.sql`, then `yarn db:generate` + `yarn db:migrate`.

Batch size: now 9 columns per row → `i += 11` (D1 100-param limit ÷ 9 = 11).

### 2. API — extend mutations

**File:** `workers/functions/lib/routes/workouts.ts`

Add `zSetMode = z.enum(['working', 'warmup', 'backoff', 'full'])` constant.

Add to Zod schemas for `createWorkout`, `updateWorkout`, `completeSession.addExercises`:
```
setMode: zSetMode.default('working')
```

Map directly to insert (it's already a string). In `importWorkouts`, default `setMode` based on exercise type (`compound` → `'warmup'`, `isolation` → `'working'`).

### 3. Muscle overlap utility for smart warmup skipping

**File:** `src/features/workouts/utils/sets.ts`

Add `shouldSkipWarmup(currentMuscles, precedingWarmedUpMuscles)`:
- Track max intensity per muscle from preceding exercises that had warmups
- Compute fraction of current exercise's total muscle intensity already warmed up
- Return `true` if overlap ≥ 0.5

Uses `exerciseMuscles` data already returned by the API.

### 4. Template editor — mode selector per exercise

**File:** `src/features/workouts/WorkoutTemplatePage.tsx`

- Extend `TemplateExercise` with `exerciseType`, `setMode`
- When adding exercise via search: default `setMode` = compound→`'warmup'`, isolation→`'working'`
- Add mode selector in `TemplateExerciseRow` (compact button group or select)
- Include `setMode` in `handleSave` payload

### 5. Session page — auto-generate planned warmup/backoff sets

**File:** `src/features/workouts/WorkoutSessionPage.tsx`

**Ephemeral override state** (not persisted — reload resets to template):
```ts
const [modeOverrides, setModeOverrides] = useState<Map<string, SetMode>>(new Map())
```

**Extend `useMemo` building `plannedSetsMap`:**
For each template exercise, resolve effective mode (override > template default):

1. If mode includes warmup (`'warmup'` | `'full'`) and `targetWeight` set: run `shouldSkipWarmup` → if not skipped, generate warmup planned sets
2. Compute working count: mode includes backoff → `targetSets - 1`, else `targetSets`. Generate working planned sets.
3. If mode includes backoff (`'backoff'` | `'full'`) and `targetWeight` set: generate 1 backoff planned set

All planned sets get a `setType` field (`'warmup' | 'working' | 'backoff'`).

Pass `modeOverrides` + setter to `ExerciseSetForm`.

### 6. ExerciseSetForm — set-type-aware planned sets + mode toggle

**File:** `src/features/workouts/components/ExerciseSetForm.tsx`

- Extend `PlannedSet` with `setType`
- Track fulfillment per set type (warmup logs vs planned warmups, etc.)
- Pass `setType` through to `PlannedSetRow.onConfirm` so confirmed sets log correct type
- Add compact mode toggle in exercise header (cycle or dropdown) for session overrides
- Remove manual "Warmup" and "Backoff" buttons — mode system replaces them

### 7. PlannedSetRow — show set type badge + colored confirm

**File:** `src/features/workouts/components/SetRow.tsx`

- Add `setType` prop to `PlannedSetRowProps`
- Show colored type badge (reusing `SET_TYPE_STYLES`) before circle button
- Style confirm circle color: warmup=carbs, working=protein, backoff=fat

## Verification

1. `yarn db:generate && yarn db:migrate` — migration applies cleanly
2. Edit template → select mode per exercise → save → reload → mode persists
3. Start session → warmup/backoff planned sets auto-appear for exercises with `targetWeight`
4. With `targetSets=3` and mode `'full'`: see warmup rows + 2 working rows + 1 backoff row
5. Override mode in session → planned sets update immediately
6. Multi-exercise: exercise 2 sharing muscles with exercise 1 (warmup mode) → exercise 2 warmup auto-skipped
7. Confirm warmup/backoff planned set → logs with correct `setType`
8. Complete session → `SessionReview` only compares working sets (unchanged)
