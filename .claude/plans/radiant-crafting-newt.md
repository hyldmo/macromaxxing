# Remove Workout Color

Remove all workout color references. The `workouts` table never had a `color` column — it's dead code.

## Files to modify

### 1. `packages/db/custom-types.ts`
- Delete `WORKOUT_COLORS` const and `WorkoutColor` type (lines 46-47)

### 2. `workers/functions/lib/routes/workouts.ts`
- Remove `WORKOUT_COLORS` and `WorkoutColor` from imports (lines 6-7)
- Delete `zWorkoutColor` definition (line 20)
- Remove `color: zWorkoutColor` from `createWorkout` input (line 244)
- Remove `color: input.color as WorkoutColor` from insert values (line 270)
- Remove `color: zWorkoutColor.optional()` from `updateWorkout` input (line 310)
- Remove `if (input.color !== undefined) set.color = input.color` from update (line 333)
- Remove `const colors = WORKOUT_COLORS` and `color: colors[...]` from `importWorkouts` (lines 829, 880)

### 3. `src/features/workouts/WorkoutTemplatePage.tsx`
- Remove `WORKOUT_COLORS` and `WorkoutColor` from import (line 1)
- Delete `COLOR_LABELS` constant (lines 14-19)
- Remove `color` state (line 42)
- Remove `color` from save payload (line 85)
- Delete color picker UI block (lines 159-179)
- Remove `cn` import if unused after

## Verification
- `yarn build` should succeed with no type errors
