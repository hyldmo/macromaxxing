# Rep Ranges for Workout Exercises

## Context

Currently `targetReps` is a single integer — when you beat it, session review just says "update to higher reps". This creates a ratchet effect with no real progression model.

**Goal:** Replace single `targetReps` with `targetRepsMin`/`targetRepsMax` to enable double-progression: work up through a rep range, then increase weight when you hit the top. This is the standard progression model in structured training.

This also makes the `trainingGoal` toggle (`hypertrophy` | `strength`) more meaningful. Currently it only affects two things: default targets when `targetReps`/`targetSets` are null (hypertrophy 3×10, strength 5×5) and rest duration multiplier (strength 2× vs hypertrophy 1×). With rep ranges, the goal drives different default ranges per exercise type, and the progression logic becomes range-aware rather than just "you beat the number."

## Default Rep Ranges

Based on training goal + exercise type:

| Goal | Compound (T1-T2) | Isolation (T3-T4) |
|------|-------------------|---------------------|
| Hypertrophy | 8-12 | 12-15 |
| Strength | 3-5 | 6-8 |

## Changes

### 1. Schema — `packages/db/schema.ts`

Replace `targetReps` with two columns on both tables:

**`workoutExercises`** (line 232):
- Remove: `targetReps: integer('target_reps')`
- Add: `targetRepsMin: integer('target_reps_min')` and `targetRepsMax: integer('target_reps_max')`

**`sessionPlannedExercises`** (line 289): Same change.

**Migration:** Drizzle will generate the table-recreate pattern. Existing `target_reps` values copy to `target_reps_min` (keep `target_reps_max` null so defaults apply). Run `yarn db:generate`, then verify + hand-edit the migration SQL for the data copy.

### 2. Constants — `src/features/workouts/utils/sets.ts`

Add rep range defaults keyed by goal × exercise type:

```ts
export const REP_RANGE_DEFAULTS: Record<TrainingGoal, Record<'compound' | 'isolation', {
	targetSets: number; targetRepsMin: number; targetRepsMax: number
}>> = {
	hypertrophy: {
		compound:  { targetSets: 3, targetRepsMin: 8,  targetRepsMax: 12 },
		isolation: { targetSets: 3, targetRepsMin: 12, targetRepsMax: 15 },
	},
	strength: {
		compound:  { targetSets: 5, targetRepsMin: 3,  targetRepsMax: 5 },
		isolation: { targetSets: 5, targetRepsMin: 6,  targetRepsMax: 8 },
	},
}

export function getExerciseDefaults(goal: TrainingGoal, type: 'compound' | 'isolation') {
	return REP_RANGE_DEFAULTS[goal][type]
}
```

Keep `TRAINING_DEFAULTS` temporarily for callers that still need a single-number default (warmup/backoff generation), using `targetRepsMin` from the compound defaults.

### 3. Divergence Logic — `src/features/workouts/utils/formulas.ts`

**Update `Divergence` interface:**
```ts
export interface Divergence {
	exerciseId: TypeIDString<'exc'>
	exerciseName: string
	planned: { sets: number; repsMin: number; repsMax: number; weight: number | null }
	actual: { sets: number; reps: number; weight: number }
	status: 'below_range' | 'in_range' | 'improved'
	suggestedWeight: number | null
}
```

**Update `PlannedExerciseInput`:** Replace `targetReps` with `targetRepsMin`/`targetRepsMax`, add `exercise: { name: string; type: 'compound' | 'isolation' }`.

**Update `computeDivergences` logic:**
- Resolve effective min/max from exercise or `getExerciseDefaults(goal, type)`
- **Below range** (`bestReps < effectiveRepsMin`): report as divergence
- **In range** (`repsMin ≤ bestReps ≤ repsMax`): skip (no divergence) unless sets/weight differ
- **Improved** (`bestReps ≥ repsMax` AND `weight ≥ targetWeight`): suggest weight increase
- **Weight suggestion:** `targetWeight + plateStep` using the existing `roundWeight` increment logic (>20kg: +2.5, >5kg: +1.25, ≤5kg: +0.5). Export `plateIncrement` helper.

### 4. Template Editor — `TemplateExerciseRow.tsx`

Replace single reps `NumberInput` (lines 95-106) with two inputs:

```
[sets input] sets × [repsMin input] - [repsMax input] reps @ [weight input]
```

Both use `NumberInput` with `w-14`. Placeholders show defaults from `getExerciseDefaults(goal, exercise.exerciseType)`.

### 5. Template Page — `WorkoutTemplatePage.tsx`

**`TemplateExercise` interface** (line 16-27): Replace `targetReps` with `targetRepsMin`/`targetRepsMax`.

Update everywhere `targetReps` is referenced:
- `useEffect` data loading (line 57)
- `dirty` check (line 79)
- `handleSave` payload (line 115)

### 6. Set Row — `SetRow.tsx`

Add optional `repRange?: { min: number; max: number } | null` prop. Show as subtle muted text after the reps input for pending (not done) working sets:

```tsx
{repRange && !done && (
	<span className="font-mono text-[10px] text-ink-faint tabular-nums">
		{repRange.min}-{repRange.max}
	</span>
)}
```

### 7. PlannedSet — `ExerciseSetForm.tsx`

Add `repRange?: { min: number; max: number } | null` to `PlannedSet` interface (line 14-19). Pass through to `SetRow` for remaining planned sets (line 181).

### 8. Session Pre-fill — `WorkoutSessionPage.tsx`

Update pre-fill logic (lines 298-349):
- Resolve `effectiveRepsMin`/`effectiveRepsMax` from template or `getExerciseDefaults`
- Working sets: `reps: effectiveRepsMin` (bottom of range)
- Attach `repRange: { min: effectiveRepsMin, max: effectiveRepsMax }` to working `PlannedSet`s
- Warmup/backoff: `repRange: null`
- `estimateReplacementWeight` call: pass `effectiveRepsMin` as the reps arg

### 9. Session Review — `SessionReview.tsx`

- Display planned as `{sets}×{repsMin}-{repsMax}` instead of `{sets}×{reps}`
- For `status === 'improved'`: show suggested weight, e.g. `→ {suggestedWeight}kg × {repsMin}-{repsMax}`
- Template update logic:
  - **Improved:** only update `targetWeight` to `suggestedWeight` (keep rep range unchanged — user restarts from bottom with heavier weight)
  - **Below range:** update both `targetRepsMin`/`targetRepsMax` to actual reps (acknowledges current capacity)

### 10. Backend — `workers/functions/lib/routes/workouts.ts`

Update all Zod schemas and DB operations:
- `createWorkout` input (line ~268): `targetReps` → `targetRepsMin`/`targetRepsMax`
- `updateWorkout` input (line ~340): same
- `createSession` snapshot (line ~486): copy both columns from template
- `completeSession` `templateUpdates` schema (line ~516): accept `targetRepsMin`/`targetRepsMax` instead of `targetReps`
- `completeSession` `addExercises` schema (line ~524): same
- `importWorkouts` (line ~859): set both `targetRepsMin`/`targetRepsMax` to the parsed reps value
- Add validation: `targetRepsMin <= targetRepsMax` via `.refine()`

### 11. Supporting Files

- **`FlatSet` in `sets.ts`** (line 205): Add `repRange` field, propagate in `flattenSets`
- **`TimerMode.tsx`**: Show range guidance below the main reps display
- **`SupersetForm.tsx`**: Pass `repRange` through to `SetRow`
- **`WorkoutCard.tsx`**: Display range in template preview
- **`export.ts`**: Format as `min-max` (or single number when min===max)

### 12. CLAUDE.md Updates

- DB Schema: `targetReps` → `targetRepsMin`/`targetRepsMax` in both tables
- API Structure: update `templateUpdates` fields
- Patterns: document `REP_RANGE_DEFAULTS` constant

## Implementation Order

1. Schema + migration (foundation)
2. Constants in `sets.ts` (new defaults)
3. `formulas.ts` divergence logic (core algorithm)
4. Backend routes (Zod schemas + DB ops)
5. `PlannedSet` interface + `WorkoutTemplatePage` types
6. Session pre-fill (`WorkoutSessionPage`)
7. UI components (`TemplateExerciseRow`, `SetRow`, `ExerciseSetForm`, `SupersetForm`)
8. Session review (`SessionReview.tsx`)
9. Supporting files (`TimerMode`, `WorkoutCard`, `export`, `FlatSet`)
10. CLAUDE.md docs

## Verification

1. `yarn db:generate` + `yarn db:migrate` — migration applies cleanly
2. `yarn dev` — app loads, existing workout templates show with migrated data
3. Template editor: verify two-input range with correct defaults per goal × type
4. Start session: working sets pre-fill with bottom of range, range shown on set rows
5. Complete session with reps at top of range → review suggests weight increase
6. Complete session with reps below range → review shows as divergence
7. Complete session within range → no divergence shown
8. Accept weight increase → template updates with new weight, range preserved
9. `yarn fix` — passes lint/format
10. `yarn test` — passes (update any tests touching `targetReps`)
