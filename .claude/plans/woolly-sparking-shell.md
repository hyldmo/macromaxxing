# Workout Feature Redesign: Template-Based Training

## Context

The current workout feature is session-centric: create a session → add exercises → log sets one at a time. But the actual use case is running the same 4 workouts in rotation. The body map uses opacity tiers of a single accent color to show recency — it should instead show muscle coverage using the 4 macro colors.

Core model change: **Workout templates** (timeless plans you rotate) vs **Session logs** (dated instances of performing a template). Every session comes from a template — no standalone sessions.

## Data Model

### New tables

**`workouts`** (template)
| Column | Type | Notes |
|--------|------|-------|
| id | `TypeID<'wkt'>` | |
| userId | FK → users | |
| name | text | "Push A", "Pull B", etc. |
| color | text | `macro-protein\|macro-carbs\|macro-fat\|macro-kcal` |
| sortOrder | integer | Display order (0-based) |
| createdAt | integer | |
| updatedAt | integer | |

**`workoutExercises`** (exercises in a template with targets)
| Column | Type | Notes |
|--------|------|-------|
| id | `TypeID<'wke'>` | |
| workoutId | FK → workouts (CASCADE) | |
| exerciseId | FK → exercises | |
| sortOrder | integer | |
| targetSets | integer | e.g. 3 |
| targetReps | integer | e.g. 8 |
| targetWeight | real (nullable) | null = "find your weight first session" |
| createdAt | integer | |

### Modified tables

**`workoutSessions`** — add `workoutId` FK → workouts (NOT NULL for new sessions)
- Existing sessions with `workoutId = null` remain as legacy data

### Unchanged
- `exercises`, `exerciseMuscles`, `workoutLogs`, `strengthStandards`

## Logging UX: Checklist Model

The biggest UX change. Current flow: type weight → type reps → click Set, per set. Too slow for between-set logging.

**New flow — pre-filled checklist:**
1. Start session → all template exercises shown with their target sets pre-rendered as "planned" rows
2. Each planned row shows: `[○] 80kg × 8` (dimmed, not yet done)
3. **Tap the row** → marks it done: `[●] 80kg × 8` (lights up in set type color)
4. If weight/reps differ from plan, tap to edit inline *before or after* marking done
5. "+" button per exercise to add sets beyond the plan
6. Extra exercises can still be added via search

**Why this is fast:** Most sets match the plan. Common case = one tap per set. Exceptions = edit + tap.

**Persistence:** Each "confirm" fires an optimistic mutation (UI updates instantly, server syncs in background). No batch save needed — data is safe, UX is fast.

### Complete → Review Divergences

When user taps "Complete":
1. Show a summary screen comparing actual vs. planned for each exercise
2. For each **divergence** (up or down), show a toggle: "Update template? [80kg × 8 → 82.5kg × 10]"
3. Default: on for improvements, off for decreases (user can override either way)
4. If user added exercises not in the template → "Add [exercise] to [Workout]?" checkboxes
5. Confirm → applies template updates + marks session complete

## Body Map Redesign

### Coverage map (replaces recency map)

Each workout gets a macro color (assigned by `sortOrder`):
- 0: `macro-protein` (teal)
- 1: `macro-carbs` (gold)
- 2: `macro-fat` (lime)
- 3: `macro-kcal` (orange)

Body map renders all workouts simultaneously:
- Each muscle colored by the workout with highest volume contribution: `Σ(targetSets × muscleIntensity)`
- Ties broken by `sortOrder` (lower wins)
- Untrained muscles: `text-ink-faint` at very low opacity
- Full-opacity colors (not opacity-based tiers like the old recency approach)

Volume is **aggregated across all workouts** for stats. The color just tells you which workout is the primary driver.

**Hover tooltip:** "Triceps — 12.4k vol · Push A (primary), Upper (secondary)"

### Implementation

`BodyMap.tsx` changes:
- Props change from `stats: Map<string, MuscleStats>` to `muscleColors: Map<string, string>` (muscle → CSS color class)
- `BodyFigure` applies the color class directly instead of calling `recencyTier()`
- Color data computed from `workouts + workoutExercises + exerciseMuscles` — pure template data, no session queries needed

## Routes

```
/workouts                         → WorkoutListPage (template cards + coverage map)
/workouts/new                     → WorkoutTemplatePage (create)
/workouts/:workoutId              → WorkoutTemplatePage (edit)
/workouts/:workoutId/session      → WorkoutSessionPage (new session from template)
/workouts/sessions/:sessionId     → WorkoutSessionPage (existing session)
```

## User Journey

1. **Create workout** → name, pick color, add exercises with target sets/reps/weight (weight optional)
2. **Start session** → click "Start" on workout card → creates session, pre-fills checklist from template
3. **Log sets** → tap each set as you do it; edit weight/reps if different from plan
4. **Complete** → review divergences, toggle which changes to push back to template
5. **View coverage** → body map on list page shows which muscles each workout covers

## Key Files

**Schema & types:**
- `packages/db/schema.ts` — add `workouts`, `workoutExercises`; add `workoutId` to `workoutSessions`
- `packages/db/relations.ts` — add relations for new tables
- `packages/db/types.ts` — add inferred types
- `packages/db/custom-types.ts` — add `wkt`, `wke` TypeID prefixes

**Backend:**
- `workers/functions/lib/routes/workouts.ts` — add template CRUD endpoints, add `workout.coverageStats`, modify `createSession` (requires `workoutId`), modify `completeSession` (accepts template updates)

**Frontend — modified:**
- `src/features/workouts/WorkoutListPage.tsx` — show template cards + coverage body map
- `src/features/workouts/WorkoutSessionPage.tsx` — checklist model, pre-fill from template, divergence review on complete
- `src/features/workouts/components/BodyMap.tsx` — accept `muscleColors` map instead of stats, remove `recencyTier`
- `src/features/workouts/components/MuscleHeatGrid.tsx` — fetch workout coverage data instead of session stats
- `src/features/workouts/components/ExerciseSetForm.tsx` — render planned sets as checkable rows
- `src/features/workouts/components/SetRow.tsx` — add "planned" (dimmed) vs "done" (colored) states

**Frontend — new:**
- `src/features/workouts/WorkoutTemplatePage.tsx` — create/edit template
- `src/features/workouts/components/WorkoutCard.tsx` — template card (name, color, exercise count, last session)
- `src/features/workouts/components/SessionReview.tsx` — divergence review modal on complete

## Implementation Order

1. **Schema + migration** — new tables, FK on sessions
2. **Backend CRUD** — template endpoints
3. **WorkoutTemplatePage** — create/edit templates
4. **WorkoutListPage** — redesign to show template cards
5. **Body map** — coverage colors from templates
6. **Session pre-fill** — checklist model from template
7. **Complete flow** — divergence review + template update
8. **Import** — adapt to create templates

## Verification

1. Create 4 workout templates with different colors and exercises
2. Body map shows correct muscle coverage with 4 macro colors
3. Start session from template → verify checklist pre-filled with targets
4. Tap sets to confirm → verify fast, optimistic updates
5. Complete session with divergences → verify review screen shows diffs
6. Accept template updates → verify template targets changed
7. Legacy sessions (no workoutId) still render
