# Simplify rep ranges: remove repRange from session display layer

## Context

The rep range feature (targetRepsMin/targetRepsMax) was added to support double-progression: work up through a range, increase weight when you hit the top. But the current implementation threads `repRange` through every set display component (SetRow, PlannedSet, FlatSet, SupersetForm, TimerMode) when the range is really only a **progression decision tool** — not something the user needs to see on every set row during a workout.

During a workout, you just need a target rep count. The range only matters at session completion when comparing actual vs planned for weight progression decisions.

## Changes

### Remove `repRange` from session/set display layer

1. **`SetRow.tsx`** — Remove `repRange` prop and its display JSX
2. **`ExerciseSetForm.tsx`** — Remove `repRange` from `PlannedSet` interface, stop passing it to SetRow
3. **`SupersetForm.tsx`** — Stop passing `repRange` to SetRow
4. **`TimerMode.tsx`** — Remove range guidance display
5. **`sets.ts`** — Remove `repRange` from `FlatSet` interface and `flattenSets`
6. **`WorkoutSessionPage.tsx`** — Remove `repRange` computation in pre-fill loop, stop attaching it to PlannedSets

### Keep range awareness where it matters

These stay as-is (already correctly updated):
- **Schema** — `targetRepsMin`/`targetRepsMax` columns
- **Backend routes** — Zod schemas, DB ops
- **`REP_RANGE_DEFAULTS` + `getExerciseDefaults()`** — exercise-type-aware defaults
- **Template editor** — two inputs for min/max
- **Divergence logic** (`computeDivergences`)  — range-aware status (below_range/in_range/improved)
- **SessionReview** — shows range comparison, suggests weight increase
- **SessionSummary** — shows range in plan comparison
- **WorkoutCard** — shows `3×8-12` in template preview (this IS the template, not a session)
- **export.ts** — template format shows range

## Verification

- `yarn tsc --noEmit` — clean compile
- `yarn fix` — no lint errors
- `yarn test` — all tests pass
