# BioMetric Validator — Workout Tracking Feature

## Context

Adding a workout tracking tab to Macromaxxing that validates lifts using biomechanical ratios. Not just logging — it enforces strength standards (compound-to-isolation ratios), penalizes ego lifting, adjusts for height/leverage, and provides AI-powered post-workout analysis. User height/weight data also enables macro-per-kg and TDEE insights in meal plans.

Independent from meal plans. Implemented in 4 phases.

## Design Direction

Dense training-log aesthetic. The workout pages are *denser* than recipes/plans — designed for speed during an active session. Muscle group heat grid as the root `/workouts` view: each muscle group shows training recency (warm copper when fresh, fading to faint as days pass) and weekly volume. Monospace everything, tabular nums, minimal chrome.

---

## Phase 1: Foundation

### 1.1 DB Schema

**File: `packages/db/schema.ts`** — Add columns to existing table + 5 new tables

**Add to `userSettings`** (no separate profile table):
```
heightCm: real (nullable)
weightKg: real (nullable)
sex: text (default 'male')  — 'male' | 'female'
```

**New tables:**

TypeID prefixes: `exc` (exercise), `exm` (exercise muscle), `ssr` (strength standard), `wks` (workout session), `wkl` (workout log)

```
exercises
  id (exc_), userId (FK→users, nullable=system), name, type ('compound'|'isolation'), createdAt

exerciseMuscles  (many-to-many: exercise → muscle groups with intensity)
  id (exm_), exerciseId (FK→exercises, cascade), muscleGroup (text), intensity (real 0.0-1.0)
  — e.g. Bench Press: chest=1.0, triceps=0.5, front_delts=0.3

strengthStandards
  id (ssr_), compoundId (FK→exercises), isolationId (FK→exercises), maxRatio (real), createdAt

workoutSessions
  id (wks_), userId (FK→users), name?, startedAt, completedAt?, notes?, createdAt

workoutLogs
  id (wkl_), sessionId (FK→sessions, cascade), exerciseId (FK→exercises),
  setNumber (int), setType ('warmup'|'working'|'backoff'|'backup'), weightKg (real),
  reps (int), rpe? (real 6-10), failureFlag (int default 0), createdAt
```

Muscle groups (fixed set, stored as text values):
`chest, upper_back, lats, front_delts, side_delts, rear_delts, biceps, triceps, forearms, quads, hamstrings, glutes, calves, core`

**File: `packages/db/relations.ts`** — Add relations for all 5 tables + extend `usersRelations`.

**File: `packages/db/types.ts`** — Add type exports.

**File: `packages/db/custom-types.ts`** — Add `MUSCLE_GROUPS` array constant + `MuscleGroup` type.

### 1.2 Settings routes (profile data)

**File: `workers/functions/lib/routes/settings.ts`** — Add:

- `settings.getProfile` → `{ heightCm, weightKg, sex } | null`
- `settings.saveProfile` → updates heightCm, weightKg, sex on userSettings
- Update `settings.get` to also return heightCm, weightKg, sex

### 1.3 Workout tRPC routes

**New file: `workers/functions/lib/routes/workouts.ts`**

```
workout.listExercises     — system + user's custom, optional type filter
workout.createExercise    — { name, type, muscles: { muscleGroup, intensity }[] }
workout.listSessions      — recent sessions, ordered by startedAt desc
workout.getSession        — session with logs + exercises + muscles (nested)
workout.createSession     — { name? }
workout.completeSession   — sets completedAt
workout.deleteSession     — owner only
workout.addSet            — { sessionId, exerciseId, weightKg, reps, setType?, rpe?, failureFlag? }
                            auto-assigns setNumber per exercise in session
workout.updateSet         — partial update
workout.removeSet         — delete
workout.muscleGroupStats  — volume per muscle group (weighted by intensity) over N days
                            Returns: { muscleGroup, weeklyVolume, lastTrained, sessionCount }[]
workout.importSets        — { sessionId?, text: string }
                            Parses CSV/tab-separated workout data, creates session + logs
                            Format: "Exercise, Weight, Reps, RPE" or "Exercise\tWeight\tReps"
workout.generateWarmup    — { exerciseId, workingWeight, workingReps }
                            Returns calculated warmup sets: bar → 50% → 70% → 85% → working
workout.generateBackoff   — { exerciseId, workingWeight, workingReps, rpe? }
                            Returns calculated backoff sets (reduce weight ~10-20%, increase reps)
```

**File: `workers/functions/lib/router.ts`** — Register `workout: workoutsRouter`

### 1.4 Seed data

**New file: `scripts/seed-exercises.ts`**

System exercises with muscle group mappings:

| Exercise | Type | Muscles (intensity) |
|----------|------|---------------------|
| Bench Press | compound | chest=1.0, triceps=0.5, front_delts=0.3 |
| Incline Bench Press | compound | chest=0.8, front_delts=0.5, triceps=0.4 |
| Overhead Press | compound | front_delts=1.0, side_delts=0.5, triceps=0.5 |
| Barbell Row | compound | upper_back=0.8, lats=0.8, biceps=0.5, rear_delts=0.3 |
| Pull-Up | compound | lats=1.0, upper_back=0.6, biceps=0.5 |
| Squat | compound | quads=1.0, glutes=0.7, hamstrings=0.3, core=0.3 |
| Deadlift | compound | hamstrings=0.8, glutes=0.8, upper_back=0.6, quads=0.4, core=0.5 |
| Romanian Deadlift | compound | hamstrings=1.0, glutes=0.7, upper_back=0.3 |
| Lateral Raise | isolation | side_delts=1.0 |
| Bicep Curl | isolation | biceps=1.0 |
| Tricep Extension | isolation | triceps=1.0 |
| Leg Curl | isolation | hamstrings=1.0 |
| Leg Extension | isolation | quads=1.0 |
| Calf Raise | isolation | calves=1.0 |
| Rear Delt Fly | isolation | rear_delts=1.0 |
| Face Pull | isolation | rear_delts=0.7, upper_back=0.3 |
| Cable Fly | isolation | chest=1.0 |
| Preacher Curl | isolation | biceps=1.0 |
| Hammer Curl | isolation | biceps=0.7, forearms=0.5 |
| Wrist Curl | isolation | forearms=1.0 |

Default strength standards:
- Overhead Press → Lateral Raise: 0.35
- Bench Press → Cable Fly: 0.50, → Tricep Extension: 0.45
- Barbell Row → Bicep Curl: 0.40, → Rear Delt Fly: 0.30
- Squat → Leg Extension: 0.45, → Leg Curl: 0.40

### 1.5 Frontend — Navigation & Routing

**File: `src/components/layout/Nav.tsx`** — Add `{ to: '/workouts', label: 'Workouts', icon: Dumbbell }` to `authLinks`. Import `Dumbbell` from `lucide-react`.

**File: `src/router.tsx`** — Add:
- `/workouts` → `WorkoutListPage` (muscle group overview + session list)
- `/workouts/new` → `WorkoutSessionPage`
- `/workouts/:id` → `WorkoutSessionPage`

### 1.6 Frontend — Feature folder

**`src/features/workouts/`**

| File | Purpose |
|------|---------|
| `WorkoutListPage.tsx` | **Root view**: Muscle group heat grid at top + recent sessions list below |
| `WorkoutSessionPage.tsx` | Session editor: add exercises, log sets, warmup/backoff generation |
| `components/MuscleHeatGrid.tsx` | Grid of muscle groups with recency/volume coloring |
| `components/MuscleCell.tsx` | Single muscle group cell: name, volume, last-trained, intensity color |
| `components/SessionCard.tsx` | Dense row: date, name, exercise count, total volume |
| `components/ExerciseSetForm.tsx` | Per-exercise card in session: set table + add set + warmup/backoff buttons |
| `components/SetRow.tsx` | Single set: type badge, weight (NumberInput), reps (NumberInput), RPE, failure, delete |
| `components/ExerciseSearch.tsx` | Typeahead (loads full list, client-side filter). Shows type + primary muscles. |
| `components/ProfileForm.tsx` | Height/weight/sex inputs for SettingsPage |
| `components/ImportDialog.tsx` | Textarea for pasting CSV/tab data + preview table + confirm |
| `utils/formulas.ts` | See below |
| `utils/sets.ts` | Warmup/backoff auto-calculation logic |
| `hooks/useEstimated1RM.ts` | Reactive Brzycki 1RM |

### 1.7 Formulas (`utils/formulas.ts`)

```ts
estimated1RM(weightKg, reps)        // Brzycki: weight * 36 / (37 - reps)
limbLengthFactor(heightCm)          // heightCm <= 185 → 1.0, else 1 + (h-185)*0.004
totalVolume(logs[])                 // Σ(weight * reps)
workDoneJoules(weightKg, reps, rom) // weight * 9.81 * rom * reps
estimateBMR(weightKg, heightCm, age, sex)  // Mifflin-St Jeor
estimateTDEE(bmr, activityMultiplier)
proteinPerKg(proteinGrams, weightKg)
```

### 1.8 Warmup/Backoff auto-calculation (`utils/sets.ts`)

```ts
generateWarmupSets(workingWeight, workingReps)
// Returns: [
//   { weight: bar (20), reps: 10, type: 'warmup' },
//   { weight: 50% working, reps: 8, type: 'warmup' },
//   { weight: 70% working, reps: 5, type: 'warmup' },
//   { weight: 85% working, reps: 3, type: 'warmup' },
// ]
// Rounds to nearest 2.5kg. Skips sets too close to working weight.

generateBackoffSets(workingWeight, workingReps, count = 2)
// Returns: [
//   { weight: 80% working, reps: workingReps + 2, type: 'backoff' },
//   { weight: 70% working, reps: workingReps + 4, type: 'backoff' },
// ]
```

Auto-generated sets are added to the session as real logs with `setType` = 'warmup'/'backoff'. User can override weight/reps on any generated set.

### 1.9 Settings page update

**File: `src/features/settings/SettingsPage.tsx`** — Add "Body Profile" Card section:
- Height (cm) — NumberInput
- Weight (kg) — NumberInput
- Sex — Select (Male/Female), default Male
- Info text: "Used for workout validation and nutrition targets"
- Uses `trpc.settings.getProfile` / `trpc.settings.saveProfile`

### 1.10 Migration

`yarn db:generate && yarn db:migrate`

---

## Phase 2: Validation Engine

### 2.1 Server routes

**File: `workers/functions/lib/routes/workouts.ts`** — Add:

- `workout.validateSet` — query: given exerciseId + weightKg + reps + sessionId:
  1. Calculate e1RM (Brzycki)
  2. Look up strength standards where exercise is the isolation
  3. Find user's best recent compound e1RM (last 30 days)
  4. Apply height-adjusted limbLengthFactor if profile has height >185cm
  5. Check ratio violation
  6. Check >5kg weight jump from previous set
  Returns `{ valid: boolean, warnings[] }`

- `workout.checkBalance` — query: compound vs isolation volume over N days for standard pairs

### 2.2 Frontend validation

| File | Purpose |
|------|---------|
| `utils/validation.ts` | `ValidationWarning` type: `{ level, code, message, details }` |
| `components/ValidationAlert.tsx` | Inline alert below sets (red/amber/neutral) |
| `components/BalanceCard.tsx` | Compound vs isolation volume on completed sessions |
| `hooks/useSetValidation.ts` | Debounced (300ms) `workout.validateSet` call |

Modify `ExerciseSetForm.tsx` to show validation warnings after weight+reps entry.

---

## Phase 3: AI Review

### 3.1 Server

**File: `workers/functions/lib/routes/workouts.ts`** — Add:

- `workout.aiReview` — mutation: session logs + profile + 4-week history → prompt → `getDecryptedApiKey` + `generateTextWithFallback` (reuses existing AI pattern from `routes/ai.ts`)

**File: `workers/functions/lib/constants.ts`** — Add `workoutReviewSchema` + `WORKOUT_REVIEW_PROMPT`:
- Output: `{ summary, totalWorkJoules, muscleGroupBreakdown[], ratioViolations[], recommendations[], overallGrade: A-F }`
- Prompt: strict biomechanics coach analyzing work (Joules), ratios, balance, RPE

### 3.2 Frontend

| File | Purpose |
|------|---------|
| `components/AIReview.tsx` | "Get AI Review" button + results card |
| `components/GradeBadge.tsx` | Large letter grade (A=success through F=destructive) |

Shows on `WorkoutSessionPage` after session is completed. Requires AI provider configured.

---

## Phase 4: Dashboard & Analytics

### 4.1 Server

**File: `workers/functions/lib/routes/workouts.ts`** — Add:

- `workout.exerciseHistory` — e1RM + volume per session for an exercise over N days
- `workout.dashboardStats` — total sessions, volume, PRs, muscle group volumes
- `workout.symmetryReport` — volume distribution across muscle groups

### 4.2 Frontend

| File | Purpose |
|------|---------|
| `WorkoutDashboardPage.tsx` | Stats + muscle balance + PRs + progress |
| `components/ProgressChart.tsx` | SVG sparkline for e1RM over time (hand-rolled like MacroRing) |
| `components/SymmetryChart.tsx` | Horizontal bars for muscle group volume |
| `components/PRCard.tsx` | Personal record card |

**File: `src/router.tsx`** — Add `/workouts/dashboard`

### 4.3 Meal plan integration

**File: `src/features/mealPlans/components/WeeklyAverages.tsx`** — When profile has height+weight+sex:
- Protein per kg bodyweight (target: 1.6–2.2 g/kg)
- Estimated TDEE (Mifflin-St Jeor with sex)
- Calorie delta (intake vs TDEE)
- Collapsible "Body Targets" section

---

## Files Summary

### Create

| Phase | File |
|-------|------|
| 1 | `workers/functions/lib/routes/workouts.ts` |
| 1 | `src/features/workouts/WorkoutListPage.tsx` |
| 1 | `src/features/workouts/WorkoutSessionPage.tsx` |
| 1 | `src/features/workouts/components/MuscleHeatGrid.tsx` |
| 1 | `src/features/workouts/components/MuscleCell.tsx` |
| 1 | `src/features/workouts/components/SessionCard.tsx` |
| 1 | `src/features/workouts/components/ExerciseSetForm.tsx` |
| 1 | `src/features/workouts/components/SetRow.tsx` |
| 1 | `src/features/workouts/components/ExerciseSearch.tsx` |
| 1 | `src/features/workouts/components/ProfileForm.tsx` |
| 1 | `src/features/workouts/components/ImportDialog.tsx` |
| 1 | `src/features/workouts/utils/formulas.ts` |
| 1 | `src/features/workouts/utils/sets.ts` |
| 1 | `src/features/workouts/hooks/useEstimated1RM.ts` |
| 1 | `scripts/seed-exercises.ts` |
| 2 | `src/features/workouts/utils/validation.ts` |
| 2 | `src/features/workouts/components/ValidationAlert.tsx` |
| 2 | `src/features/workouts/components/BalanceCard.tsx` |
| 2 | `src/features/workouts/hooks/useSetValidation.ts` |
| 3 | `src/features/workouts/components/AIReview.tsx` |
| 3 | `src/features/workouts/components/GradeBadge.tsx` |
| 4 | `src/features/workouts/WorkoutDashboardPage.tsx` |
| 4 | `src/features/workouts/components/ProgressChart.tsx` |
| 4 | `src/features/workouts/components/SymmetryChart.tsx` |
| 4 | `src/features/workouts/components/PRCard.tsx` |

### Modify

| Phase | File | Change |
|-------|------|--------|
| 1 | `packages/db/schema.ts` | Add heightCm/weightKg/sex to userSettings + 5 new tables |
| 1 | `packages/db/relations.ts` | Add relations for new tables + extend usersRelations |
| 1 | `packages/db/types.ts` | Add type exports |
| 1 | `packages/db/custom-types.ts` | Add MUSCLE_GROUPS + MuscleGroup type |
| 1 | `workers/functions/lib/router.ts` | Register workout router |
| 1 | `workers/functions/lib/routes/settings.ts` | Add getProfile/saveProfile |
| 1 | `src/components/layout/Nav.tsx` | Add Workouts to authLinks |
| 1 | `src/router.tsx` | Add /workouts routes |
| 1 | `src/features/settings/SettingsPage.tsx` | Add Body Profile card |
| 3 | `workers/functions/lib/constants.ts` | Add review schema + prompt |
| 4 | `src/router.tsx` | Add /workouts/dashboard |
| 4 | `src/features/mealPlans/components/WeeklyAverages.tsx` | Add protein/kg + TDEE |
| All | `CLAUDE.md` | Update API Structure, Key Files |

## Phase Dependencies

```
Phase 1 → prerequisite for all
Phase 2 → needs Phase 1 (exercise data + logs)
Phase 3 → needs Phase 1 (completed sessions), independent of Phase 2
Phase 4 → needs Phase 1 (historical data)
Phase 4 meal plan integration → needs Phase 1 profile columns
```

## Verification

After each phase:
1. `yarn db:generate && yarn db:migrate` (if schema changes)
2. `yarn dev` — app starts, new routes accessible
3. Navigate to /workouts — page renders with muscle group grid
4. Create session → add exercises → log sets → warmup auto-calc → complete
5. Import: paste CSV data → preview → confirm → sets created
6. `yarn fix` — lint/format passes
7. `yarn build` — succeeds
