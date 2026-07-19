# Macromaxxing

Recipe nutrition tracker for meal preppers. Track macros per portion.

## Code Style

- Indentation: tabs (not spaces) in all files
- Always use `yarn` (the workspace package manager) — never `npx` or `npm`

## Stack

- **Frontend:** React 19, Vite 7, Tailwind 4, tRPC, React Router 7 (framework mode, SPA-only via `ssr: false`), PWA (vite-plugin-pwa + Workbox)
- **Backend:** Cloudflare Pages Functions (Hono + tRPC), D1 (SQLite), R2 (images), Drizzle ORM
- **Auth:** Cookie-based via Clerk (Google/GitHub OAuth), user ID in context
- **AI:** Multi-provider (Gemini/OpenAI/Anthropic), BYOK, keys encrypted with AES-GCM

## Environments

- **Production:** https://macromaxxing.com (auto-deploys from `main` via Cloudflare Pages)

## Commands

```bash
yarn dev          # Full local dev (frontend + API + local D1)
yarn dev:web      # Frontend only (API_URL defaults to localhost:8788)
yarn dev:api      # API only (wrangler + local D1 on port 8788)
yarn dev:remote   # Frontend only (proxies to production API)
yarn build        # Build
yarn preview      # Preview build with local D1
yarn check        # Run ALL checks in parallel (lint + typecheck + test) — use this to verify changes
yarn fix          # Lint + format (Biome)
yarn db:generate  # Generate migration from schema
yarn db:migrate   # Apply migrations to local D1
yarn db:seed:usda # Import USDA Foundation + SR Legacy foods into local D1
yarn test         # Run tests (Vitest)
```

**Always run `yarn check` to verify changes.** Do not run lint, typecheck, or test separately.

Set `API_URL` env var to override the API proxy target (defaults to `http://localhost:8788`).

## Local Setup

Create `.dev.vars` for local secrets:

```bash
# Generate a secret: openssl rand -hex 32
ENCRYPTION_SECRET=your-32-byte-hex-secret
# Get from https://fdc.nal.usda.gov/api-key-signup/
USDA_API_KEY=your-usda-api-key
# Get from Clerk dashboard
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Create `.env.local` for frontend:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_R2_BASE_URL=https://pub-xxx.r2.dev   # R2 public bucket URL (shared across all envs)
```

## Source Tree

```
src/
  root.tsx                                  # App shell: Layout (HTML doc + providers), Root (default), HydrateFallback, ErrorBoundary
  routes.ts                                 # flatRoutes() from @react-router/fs-routes
  routes/                                   # One file per URL. Each file is the page component (default export).
                                            #   For URLs that share a page (new + edit), the route file re-exports
                                            #   from features/ — see Routes below.
  index.css                                 # Design tokens + Tailwind
  lib/
    trpc.ts                                 # tRPC react-query client
    user.tsx                                # useUser() hook (Clerk)
    cn.ts                                   # cn() utility (clsx + twMerge)
    images.ts                               # getImageUrl, isExternalImage, getImageAttribution (R2/external URL)
    chart/                                  # scale.ts: shared SVG chart scale helpers (linear/log, ticks, padding)
    workouts/                               # Pure helpers: programCycle (pickNextWorkout), programLoad (computeProgramLoad), sets, etc.
                                            #   formulas.ts re-exports from @macromaxxing/db (shared with workers/)
  components/
    ui/                                     # Button, Input, NumberInput, Select, Switch, Card, Spinner, ReloadPrompt, etc.
    layout/Nav.tsx                           # Top nav + mobile bottom tabs + RestTimer
    layout/RootLayout.tsx                    # Shell: nav + <Outlet />
    ErrorBoundary.tsx
  features/                                 # Domain helpers: sub-components, hooks, utils. Single-URL page
                                            #   components live in routes/; pages shared across multiple URLs
                                            #   (RecipeEditor, ExerciseDetail, WorkoutTemplate, WorkoutSession,
                                            #   ProgramEditor) live here and the route files import them.
    landing/
      LandingPage.tsx                     # Signed-out home; composition of sections (used inline by routes/_index.tsx)
      components/                         # SectionShell, MonoLabel, BarcodeStrip, GridPaperBackground
      sections/                           # Hero, NumbersRail, PlateSection, RackSection, CycleSection (programs +
                                          #   technique guides), SignalSection (composes live RecentPRsList /
                                          #   StalledList / WeeklyVolumeChart / CalendarHeatmap / HistoryChart with
                                          #   mock data typed via ComponentProps<typeof X>), IntelligenceSection,
                                          #   HowItWorks, FaqSection, FooterCta (one file per section)
    recipes/
      RecipeEditorPage.tsx                  # Create/edit recipe (ingredients table, macros, portions). Shared by
                                            #   /recipes/new and /recipes/:id.
      components/                           # MacroRing, MacroBar, MacroReadout, MacroCell, RecipeIngredientTable,
                                            #   RecipeIngredientRow, RecipeSummaryRow, RecipeTotalsBar, PortionPanel,
                                            #   PortionSizeInput, CookedWeightInput, IngredientSearchInput,
                                            #   PreparationInput, RecipeImportDialog, PremadeDialog, RecipeCard,
                                            #   RecipeImageUpload, SubrecipeExpandedRows, HighlightedInstructions,
                                            #   BatchMultiplierPills, CookIngredientList, CookInstructionSteps,
                                            #   CookPortionSummary
      hooks/useRecipeCalculations.ts        # Derives totals, per-portion, per-100g from ingredients + cooked weight
      utils/macros.ts                       # Pure math: macro calculations
      utils/format.ts                       # Number/unit formatting helpers
    ingredients/
      components/IngredientForm.tsx          # Add/edit ingredient form
      components/MacroInput.tsx              # Macro number input
    exercises/
      ExerciseDetailPage.tsx                # /exercises/:id (and /new): editor + history chart/table. Shared by both routes.
      components/                           # ExerciseForm, ExerciseCard, ExerciseTable,
                                            #   HistoryChart (SVG time-series), HistoryTable
    analytics/
      components/                           # RecentPRsList, StalledList, WeeklyTrendList, CalendarHeatmap
    mealPlans/
      MealPlansSection.tsx                  # List/create/delete meal plans (composed in routes/plans._index.tsx)
      components/                           # InventorySidebar, InventoryCard, AddToInventoryModal,
                                            #   WeekGrid, DayColumn, MealSlot, MealCard, MealPopover,
                                            #   SlotPickerPopover, DayTotals, WeeklyAverages
    workouts/
      WorkoutTemplatePage.tsx               # Create/edit workout template (exercises, targets, supersets). Shared by
                                            #   /workouts/new and /workouts/:workoutId.
      WorkoutSessionPage.tsx                # Active session: checklist model with pre-filled planned sets. Shared by
                                            #   /workouts/:workoutId/session and /workouts/sessions/:sessionId.
      WorkoutMode.tsx                       # WorkoutModes: setMode ButtonGroup (working/warmup/backoff/full)
      store/useWorkoutSessionStore.ts       # Zustand: global session state (sessionId, cursor, draft, rest, setTimer) — canonical "is session in progress" signal; persists across routes.
                                            #   Holds NO set queue: timer mode derives it live via flattenSets(exerciseGroups) and resolves cursor
                                            #   (stable {exerciseId, setNumber} identity) against it via src/lib/workouts/timerQueue.ts
      components/
        BodyMap.tsx                          # Interactive front/back muscle group SVG (male/female)
        MuscleHeatGrid.tsx                  # Muscle group volume/frequency stats grid
        WorkoutCard.tsx                     # Workout template card with exercise count + last session
        SessionCard.tsx                     # Session history card (date, exercises, volume)
        TemplateExerciseRow.tsx             # Exercise row in template editor (targets, mode, superset links)
        ExerciseSetForm.tsx                 # Per-exercise set form in session (planned + actual sets)
        SetRow.tsx                          # Single set row: weight, reps, RPE, type badge, confirm
        SupersetForm.tsx                    # Interleaved superset card (rounds with transition timers)
        ExerciseSearch.tsx                  # Exercise typeahead (system + custom, shows type + muscles)
        SessionReview.tsx                   # Post-workout divergence review (update template targets)
        SessionSummary.tsx                  # Completed session summary (1RM stats, volume, plan comparison)
        TimerModeView.tsx                   # Presentational timer overlay (consumed by routes/workouts.sessions.$sessionId.timer.tsx and landing AutoSection)
        SessionNotesModal.tsx               # In-session notepad: one section per template exercise (edits workoutExercises.note
                                            #   via updateExerciseNote) + a "Session notes" section (workoutSessions.notes). Debounced
                                            #   per-field autosave; opening from timer mode focuses the active exercise's section.
        TimerRing.tsx                       # SVG circular timer progress ring
        RestTimer.tsx                       # Nav timer widget (countdown / elapsed / session link)
        ImportDialog.tsx                    # Import workouts from spreadsheet/CSV
        ProfileForm.tsx                     # Body profile inputs (height/weight/sex)
        ProgramCard.tsx                     # Program row: star toggle for active + N sets/cycle stat
        ProgramsSection.tsx                 # Programs list + "New program" CTA, embedded into /plans
        ProgramEditor.tsx                   # Shared by /plans/programs/new and /plans/programs/:id (drag-reorder workouts + sidebar)
        ProgramCyclePreview.tsx             # Numbered cycle: "1. Push → 2. Pull → wraps to 1"
        ProgramMuscleSidebar.tsx            # Stats + BodyMap + balance bars; exports BelowMevWarning
        LastSessionHint.tsx                 # Inline "last time: 80kg × 8" hint above set rows
        ExerciseGuideContent.tsx            # Renders technique guide (description + cues + pitfalls)
      utils/
        sets.ts                             # generateWarmupSets, generateBackoffSets, calculateRest, shouldSkipWarmup
        export.ts                           # Workout data export
packages/db/                                # Shared package @macromaxxing/db
  schema.ts                                 # All tables (see DB Schema below)
  relations.ts                              # Drizzle relations
  types.ts                                  # Inferred types (Recipe, Ingredient, Exercise, Workout, etc.)
  custom-types.ts                           # typeidCol, newId, AiProvider, FatigueTier, MuscleGroup, SetMode, etc.
  preparation.ts                            # Preparation descriptor extraction (extractPreparation)
  formulas.ts                               # Pure workout math (estimated1RM, totalVolume, isE1rmPR, isStalledExercise)
                                            #   shared between src/ and workers/ (workers/ can't import from src/)
  muscle-load.ts                            # Pure muscle-load aggregation (MEV/MAV/MRV zones, balance ratios)
workers/functions/
  [[catchall]].ts                            # Root catchall: turns CF Pages SPA-fallback HTML into 404 for asset-shaped paths
  api/[[route]].ts                          # Hono entry: Clerk auth middleware → image upload/delete routes → tRPC handler
  lib/
    trpc.ts                                 # TRPCContext { db, user, env }, publicProcedure, protectedProcedure
    router.ts                               # Merges all route files into appRouter
    auth.ts                                 # Clerk cookie verification → AuthUser { id, email }
    db.ts                                   # Drizzle D1 setup → Database type
    ai-utils.ts                             # Multi-provider AI client (Gemini/OpenAI/Anthropic), model fallback
    crypto.ts                               # AES-GCM encrypt/decrypt for API keys
    constants.ts                            # Shared constants + Zod schemas
    utils.ts                                # Shared backend helpers (toStartCase, etc.)
    routes/
      dashboard.ts                          # dashboard.* endpoints
      recipes.ts                            # recipe.* endpoints
      ingredients.ts                        # ingredient.* endpoints
      mealPlans.ts                          # mealPlan.* endpoints
      workouts.ts                           # workout.* endpoints
      analytics.ts                          # analytics.* endpoints (PRs, stalled, top, weeklyTrend, calendarHeatmap)
      ai.ts                                 # ai.* endpoints
      settings.ts                           # settings.* endpoints
      user.ts                               # user.* endpoints
scripts/
  seed-exercises.ts                         # System exercises with muscle group mappings + strength standards
  seed-usda.ts                              # Import USDA Foundation + SR Legacy foods into D1
```

## Routes

```
/                                    → DashboardPage (signed-in) / LandingPage (signed-out)
/recipes                             → RecipeListPage
/recipes/new                         → RecipeEditorPage
/recipes/:id                         → RecipeEditorPage
/recipes/:id/cook                    → CookModePage
/ingredients                         → IngredientListPage
/exercises                           → ExerciseListPage
/exercises/new                       → ExerciseDetailPage (create mode)
/exercises/:id                       → ExerciseDetailPage (editor + history chart/table)
/plans                               → PlansPage (Meal Plans + Workout Programs sections)
/plans/programs/new                  → ProgramEditor (new program)
/plans/programs/:id                  → ProgramEditor (edit program)
/plans/:id                           → MealPlannerPage
/workouts                            → WorkoutListPage
/workouts/new                        → WorkoutTemplatePage
/workouts/:workoutId                 → WorkoutTemplatePage
/workouts/:workoutId/session         → WorkoutSessionPage (new session from template)
/workouts/sessions/:sessionId        → WorkoutSessionPage (existing session)
/workouts/sessions/:sessionId/timer  → TimerMode (nested child route)
/analytics                           → AnalyticsPage (PRs, stalled lifts, weekly trend, calendar heatmap)
/settings                            → SettingsPage
```

## DB Schema

```
users(id PK clerk_user_id, email)
  → userSettings(userId FK, aiProvider, aiApiKey encrypted, aiModel, batchLookups, modelFallback,
                 heightCm?, weightKg?, sex: male|female)

ingredients(id typeid:ing, userId, name, protein/carbs/fat/kcal/fiber per 100g raw, density?, sourceId?, source: manual|ai|usda|openfoodfacts|label)
  → ingredientUnits(id typeid:inu, ingredientId, name e.g. tbsp/scoop/pcs, grams, isDefault, source)

recipes(id typeid:rcp, userId, name, type: recipe|premade, instructions?, cookedWeight?, portionSize?, isPublic, sourceUrl?, image?)
  → recipeIngredients(id typeid:rci, recipeId, ingredientId?, subrecipeId?, amountGrams, displayUnit?, displayAmount?, preparation?, sortOrder)

mealPlans(id typeid:mpl, userId, name)
  → mealPlanInventory(id typeid:mpi, mealPlanId, recipeId, totalPortions)
    → mealPlanSlots(id typeid:mps, inventoryId, dayOfWeek 0=Mon..6=Sun, slotIndex, portions default 1)

exercises(id typeid:exc, userId?, name, type: compound|isolation, fatigueTier: 1-4, bwMultiplier default 0 — 0=absolute load, >0=bodyweight fraction)
  → exerciseMuscles(id typeid:exm, exerciseId, muscleGroup, intensity 0.0-1.0)
  → exerciseGuides(id typeid:egd, exerciseId unique, description, cues JSON string[], pitfalls JSON string[]?, updatedAt)

strengthStandards(id typeid:ssr, compoundId FK, isolationId FK, maxRatio)

workouts(id typeid:wkt, userId, name, trainingGoal: hypertrophy|strength, sortOrder)
  → workoutExercises(id typeid:wke, workoutId, exerciseId, sortOrder, targetSets?, targetReps?, targetWeight?,
                     setMode: working|warmup|backoff|full, supersetGroup?, note? — shown in timer mode)

workoutSessions(id typeid:wks, userId, workoutId?, name?, startedAt, completedAt?, notes?)
  → sessionPlannedExercises(id typeid:spe, sessionId, exerciseId, sortOrder, targetSets?, targetReps?,
                            targetWeight?, setMode, trainingGoal?, supersetGroup?)
  → workoutLogs(id typeid:wkl, sessionId, exerciseId, setNumber, setType: warmup|working|backoff,
                weightKg, reps, rpe?, failureFlag)

workoutPrograms(id typeid:wpr, userId, name, sortOrder, UNIQUE(userId, name))
  → workoutProgramItems(id typeid:wpi, programId, workoutId, sortOrder)  -- both FKs ON DELETE CASCADE
userSettings += activeProgramId? typeid:wpr  -- nullable, ON DELETE SET NULL

usda_foods(fdc_id PK integer, description, data_type: foundation|sr_legacy, protein/carbs/fat/kcal/fiber per 100g, density?)
  → usda_portions(id autoincrement PK, fdc_id FK, name, grams, is_volume)

apiTokens(id typeid:atok, userId FK, name, tokenHash unique, lastUsedAt?, createdAt)
```

All IDs use TypeID prefixes (e.g. `ing_abc123`). All timestamps are unix epoch integers.
Muscle groups (fixed set): chest, upper_back, lats, front_delts, side_delts, rear_delts, biceps, triceps, forearms, quads, hamstrings, glutes, calves, core.

## Design Tokens

Use these Tailwind classes (defined in `src/index.css`):

**Surfaces:** `bg-surface-0` (base), `bg-surface-1` (cards), `bg-surface-2` (hover)
**Text:** `text-ink`, `text-ink-muted`, `text-ink-faint`
**Border:** `border-edge`
**Macro colors:** `text-macro-protein`, `text-macro-carbs`, `text-macro-fat`, `text-macro-kcal`, `text-macro-fiber`
**Accent:** `bg-accent`, `text-accent`, `hover:bg-accent-hover`
**Radius:** `rounded-sm` (4px), `rounded-md` (6px)
**Sizing:** Use `size-4` instead of `w-4 h-4`

No shadows — borders-only depth strategy.

## Patterns

- All numbers use `font-mono tabular-nums`
- Macro visualization: `MacroRing` (donut), `MacroBar` (stacked bar), `MacroReadout` (single value) — accept `macros` object prop, not individual scalars
- Reuse existing types (`Pick<AbsoluteMacros, ...>`, `RouterOutput`, etc.) — never manually spell out fields that an existing type already covers
- Never cast types. There's a 99% chance you're wrong or dug yourself into a corner, and you will introduce bugs. Always prefer `const foo: Type = bar` over `const foo = bar as Type`
- Always prefer using TypeID types, like `Exercise['id]` instead of strings.
- Shared types live in `@macromaxxing/db` (packages/db/types.ts), re-exported via `~/lib/` for frontend (e.g. `~/lib/macros`)
- Forms use `Input` from `~/components/ui/Input`
- Buttons use `Button` with variants: `default`, `destructive`, `outline`, `ghost`. `Button` defaults to `type="button"` — pass `type="submit"` explicitly for form submit buttons (silent failure otherwise).
- Connected toggle groups use `ButtonGroup` from `~/components/ui` — supports `size` (`sm`/`md`), `expandedLabel` for hover-to-expand, and read-only mode (omit `onChange`). Do NOT use inline button groups.
- Cards use `Card`, `CardHeader`, `CardContent` from `~/components/ui/Card`
- tRPC client: `import { trpc } from '~/lib/trpc'`
- Global UI chrome (Nav, banners, overlays) that reacts to workout state must source from `useWorkoutSessionStore`, not `useMatch`/route. Route gating misses routes you navigate away to mid-session. Pick the signal carefully: `sessionId !== null` = session exists (even before user starts), `sessionStartedAt !== null` = timer activated (user has started at least one set), `rest !== null` = rest countdown running. Example: `const timerActive = useWorkoutSessionStore(s => s.sessionStartedAt !== null)`.
- **PR detection:** `e1RM > priorMax + 0.5kg` tolerance via `isE1rmPR` from `@macromaxxing/db`. Render PRs as `text-success` + `↑` glyph — no chrome, no toast, no celebration animation (locked design decision).
- **Hand-rolled SVG charts:** no charting library in v1. Use `<svg viewBox>` + responsive sizing; share scale math via `src/lib/chart/scale.ts` (linear/log scales, ticks, padding). Defer Recharts/Visx until brushing/zoom/multi-series demand it.
- React components should have this style, using implicit return if possible:
	```tsx
	export interface CookedWeightInputProps {
		cookedWeight: number | null
		rawTotal: number
		onChange: (value: number | null) => void
	}

	export const CookedWeightInput: FC<CookedWeightInputProps> = ({ cookedWeight, rawTotal, onChange }) => <div>...
	```

## API Structure

```
trpc.recipe.list/get/create/update/delete
trpc.recipe.addIngredient/updateIngredient/removeIngredient
trpc.recipe.addSubrecipe                    # Add recipe as subrecipe component (with cycle detection)
trpc.recipe.addPremade                      # Creates premade meal (ingredient source:'label' + recipe type:'premade') from nutrition label
trpc.ingredient.list/create/update/delete/findOrCreate/batchFindOrCreate
trpc.ingredient.listUnits/createUnit/updateUnit/deleteUnit
trpc.mealPlan.list/get/create/update/delete/duplicate
trpc.mealPlan.addToInventory/updateInventory/removeFromInventory
trpc.mealPlan.allocate/updateSlot/removeSlot/copySlot
trpc.workout.guide                                                        # No-arg orientation doc (MCP tool workout_guide) — training/program-design conventions reference incl. bwMultiplier bodyweight logging
trpc.workout.listExercises/createExercise/updateExercise/deleteExercise   # System + user exercises with muscle mappings
trpc.workout.getGuide/upsertGuide/deleteGuide                             # Technique guide (description, cues, pitfalls) per exercise; system guides read-only
trpc.workout.listWorkouts/getWorkout/createWorkout/updateWorkout/reorderWorkouts/deleteWorkout
trpc.workout.listPrograms/getProgram/createProgram/updateProgram/deleteProgram/reorderPrograms
trpc.workout.setActiveProgram               # Set/clear active program (drives Dashboard "Up next" cycle)
trpc.workout.programMuscleLoad              # Per-muscle aggregate across the program cycle (zones, balances, below-MEV)
trpc.workout.listSessions/getSession/createSession/completeSession/updateSessionNotes/deleteSession
trpc.workout.updateExerciseNote             # Set a template exercise's per-exercise note (workoutExercises.note, shown in timer mode)
trpc.workout.updatePlannedExercise          # Session-scoped plan edit (setMode, per-exercise trainingGoal) — does not touch the template
trpc.workout.replaceSessionExercise         # Swap an exercise in an active session (moves logs + plan row, resets targets, seeds estimated weight)
trpc.workout.lastSessionForExercise         # Single-exercise last-session lookup (UI hot-path: LastSessionHint)
trpc.workout.lastSessionsForExercises       # Batched variant — single query for N exercises (avoids N+1 on session entry)
trpc.workout.addSet/updateSet/removeSet
trpc.workout.muscleGroupStats               # Volume per muscle group (weighted by intensity) over N days
trpc.workout.exercisesByMuscleGroup         # Exercises (system + custom) targeting a muscle group, sorted by that muscle's intensity
trpc.workout.sessionsByMuscleGroup          # Logged sessions that trained a muscle group (working sets), with contributing exercises + effective sets/volume
trpc.workout.coverageStats                  # Template muscle coverage for body map
trpc.workout.exerciseMuscleLoad             # Single-exercise muscle breakdown at a given sets/reps/weight dose
trpc.workout.workoutMuscleLoad              # Workout-template weekly breakdown with MEV/MAV/MRV zones + balance ratios
trpc.workout.sessionMuscleLoad              # Logged-session breakdown from actual working sets + balance ratios
trpc.workout.muscleGroupTrend               # Current vs rolling-average muscle load per window (sets + kg·reps delta %)
trpc.workout.exerciseHistory                # Per-exercise time series (top set, e1RM, volume per session) over 4w/12w/1y
trpc.workout.generateWarmup/generateBackoff # Auto-calculated warmup/backoff sets
trpc.workout.importWorkouts                 # Import workout templates from spreadsheet text
trpc.workout.importSets                     # Import sets from CSV/spreadsheet text
trpc.workout.listStandards                  # Compound-to-isolation strength ratio standards
trpc.dashboard.summary                      # Aggregated dashboard data: today's meals, recent sessions, workout templates
trpc.analytics.recentPRs                    # Recent personal records (e1RM PRs vs prior max) within window
trpc.analytics.stalledExercises             # Exercises with no progression over N sessions (flag for deload/swap)
trpc.analytics.topExercises                 # Top exercises by working-set count over window
trpc.analytics.weeklyTrend                  # Per-muscle current-period vs prior-period delta (sets + tonnage)
trpc.analytics.calendarHeatmap              # Per-day training density (sessions, sets) for calendar grid
trpc.analytics.weeklyVolumeByMuscle         # Per-week intensity-weighted volume by muscle group (Monday-aligned UTC grid)
trpc.settings.get/save
trpc.settings.listTokens/createToken/deleteToken    # Personal access token management
trpc.ai.lookup                              # Returns { protein, carbs, fat, kcal, fiber, density, units[], source } per 100g
trpc.ai.estimateCookedWeight                # Returns { cookedWeight } based on ingredients + instructions
trpc.ai.parseRecipe                         # Parses recipe from URL (JSON-LD → AI fallback) or text (AI); returns imageUrl
trpc.ai.parseProduct                        # Parses product nutrition from URL (JSON-LD Product → AI fallback)

# Non-tRPC routes (raw Hono, multipart form data)
POST   /api/recipes/:id/image              # Upload recipe image to R2 (max 5MB, image/* only)
DELETE /api/recipes/:id/image              # Remove recipe image (cleans up R2 if upload)

# MCP endpoint (Model Context Protocol)
POST   /api/mcp                                       # MCP server (Clerk OAuth bearer OR personal token, stateless)
GET    /.well-known/oauth-protected-resource/api/mcp  # RFC 9728 metadata (public, points at Clerk auth server)
GET    /.well-known/oauth-authorization-server        # RFC 8414 metadata (proxies Clerk FAPI, public)
```

`ingredient.findOrCreate` - Checks DB for existing ingredient (case-insensitive, auto-normalizes to Start Case), then tries USDA API, falls back to AI if not found. Returns `{ ingredient, source: 'existing' | 'usda' | 'ai' }`. AI also populates units (tbsp, pcs, scoop, etc.) with gram equivalents.

`ingredient.batchFindOrCreate` - Same as `findOrCreate` but for multiple ingredients at once. DB lookup via `IN` clause, parallel USDA lookups, single AI call for all unknowns. Returns results in input order. Gated by `batchLookups` user setting.

**Per-user AI settings** (both off by default):
- `batchLookups` — batch N ingredient AI calls into 1 (fewer requests, may reduce accuracy)
- `modelFallback` — retry with cheaper models on 429 (Gemini fallback chain: gemini-2.5-flash → gemini-2.5-flash-lite-preview → gemma-3-27b-it)

**Meal Plans** - Template-based weekly meal planning with per-plan inventory:
- Add recipes to plan's inventory with portion count → allocate portions to day slots (Mon-Sun)
- Slots reference inventory items, enabling portion tracking (remaining = total - allocated)
- Over-allocation allowed with visual warning

**Nutrition lookup priority:** Local USDA D1 (FTS5 search, ~14k foods) → USDA FoodData Central API → AI (user's configured provider)

**Ingredient source linkage** — `source` discriminates provenance; `sourceId` (text, nullable) holds the vendor's external record id (USDA `fdcId` as a decimal string, OFF barcode with leading zeros preserved). `getSourceUrl(source, sourceId)` from `@macromaxxing/db` builds the external link from a per-source registry; `manual`/`ai` have no `sourceId`. Barcode scans are tagged `source: 'openfoodfacts'` (not `manual`). USDA dedup queries on `{ source: 'usda', sourceId }`, not a typed id column.

**Public endpoints (no auth):** `recipe.list`, `recipe.get`, `ingredient.list` — all use `publicProcedure` (auth optional). Authenticated users see their own items in addition to public ones.

**Premade meals** — Tracked as `type: 'premade'` recipes backed by a single ingredient with `source: 'label'`. Premade recipes are always private (never shown to unauthenticated users). Backing ingredients are hidden from the ingredient list (`source != 'label'` filter).

**Recipe images** — Single `image` column stores either an R2 object basename `{recipeId}-{uploadTimestamp}` (R2 upload at `recipes/{basename}`; legacy rows hold the bare recipe ID) or an `http*` URL (external, hotlinked). Keys are versioned per upload because replacing an image must change its URL — R2 serves `Last-Modified` without `Cache-Control`, so browsers heuristically cache a stable URL for ~10% of the object's age with no revalidation. Deletion sites only touch keys prefixed by the owning recipe's ID (`recipe.update` accepts any `rcp_*` string as `image`, so a crafted value must not delete another recipe's object). Upload/delete via raw Hono routes (`POST/DELETE /api/recipes/:id/image`) since tRPC doesn't support multipart. Frontend resolves via `getImageUrl()` from `~/lib/images`. External images show "from hostname" attribution. R2 objects are cleaned up on image removal and recipe deletion. Images extracted from JSON-LD during recipe URL imports.

**Subrecipes** — Recipes can be added as components of other recipes. `recipeIngredients` rows have either `ingredientId` or `subrecipeId` set (never both). Subrecipe macros are derived from the child recipe's ingredients and scale with portions. Cycle detection prevents circular references.

**Workouts** — Template-based training with checklist-driven session logging:
- **Templates** define exercises with target sets/reps/weight and set modes (working/warmup/backoff/full)
- **Sessions** are instances of templates with pre-filled planned sets — tap to confirm each set
- **Sessions own their plan**: `createSession` snapshots the template into `sessionPlannedExercises`, and the live
  session UI reads ONLY that snapshot (`buildSessionPlan` in src/lib/workouts/sessionPlan.ts). Mid-session edits
  (set mode, per-exercise goal via `updatePlannedExercise`; exercise swap via `replaceSessionExercise`) mutate the
  snapshot, survive refresh, and never touch the template. Template edits do NOT affect running sessions — the
  session→template direction is handled by SessionReview on completion. Exception: per-exercise `note` is read live
  from the template (guidance text, not plan state) and is deliberately editable mid-session from the timer notepad
  (`updateExerciseNote` writes `workoutExercises.note`, so it DOES update the template). Sessions predating the snapshot
  fall back to the template read-only.
- **Set mutations** (add/update/remove with optimistic getSession cache updates incl. optimistic→real id swap) live in
  `useSessionSets` (src/features/workouts/hooks/useSessionSets.ts) — shared by the checklist page and timer mode; rest
  timers are started by the caller, not the mutation
- **Supersets** group exercises via `supersetGroup` integer — rendered as interleaved rounds with transition timers
- **Fatigue tiers** (1-4) on exercises drive dynamic rest duration: `reps × 4 × goalMultiplier + tierModifier`
- **Body map** shows muscle coverage per workout template using exercise-muscle intensity mappings
- **Session review** on completion compares actual vs. planned, offers to update template targets
- **Rest timer** persists globally (nav widget) — shows countdown, overshot time, or session elapsed
- **Timer route** (`/workouts/sessions/:id/timer`) renders as full-screen child route via `<Outlet>`
- Body profile (height/weight/sex) stored in `userSettings`, used for workout validation

**Workout Programs** — Named ordered groupings of workout templates (e.g. PPL):
- One program can be marked active via `userSettings.activeProgramId` (FK ON DELETE SET NULL)
- Dashboard "Up next" cycles within the active program; off-program completions are ignored
- `pickNextWorkout` (src/lib/workouts/programCycle.ts) returns a discriminated `legacy | program | emptyActiveProgram` so the dashboard can render the cycle subtitle ("Day N of M") or an empty-program banner without `if/else` contradictions
- Editor (`/plans/programs/:id`) drag-reorders draft items and resolves them against the cached `listWorkouts` data each render — sidebar muscle load updates live before save
- Muscle aggregation has two paths:
  - **Client-side** `computeProgramLoad` (src/lib/workouts/programLoad.ts) for the live editor (no round-trip; uses cached `listWorkouts.exercises.muscles`)
  - **Server-side** `programMuscleLoad` tRPC procedure for MCP agents — same shape, computed across the saved cycle
- `updateProgram` does atomic delete-then-chunked-insert via `db.batch([...])` (D1 has no Drizzle transactions; chunk = 20 rows for the 5-col `workout_program_items`)

**PWA** — Installable progressive web app via `vite-plugin-pwa`:
- Workbox precaches all static assets (`js, css, html, ico, png, svg, woff2`) with SPA `navigateFallback` (excludes `/api/`)
- `registerType: 'prompt'` — `ReloadPrompt` component shows update banner when new version is available. `autoUpdate` is intentionally avoided because vite-plugin-pwa forces `skipWaiting` + `clientsClaim` in that mode and reloads the page mid-session, which would interrupt in-progress workout logging.
- `cleanupOutdatedCaches: true` so activating a new SW drops stale precache entries (prevents unbounded cache growth across deploys)
- `public/self-heal.js` (loaded synchronously in `<head>` via `src/root.tsx`) catches `<script>/<link>` load failures for `/assets/*` paths (the symptom of a stale SW or browser cache referencing a removed hashed chunk), unregisters the SW, clears caches, and reloads with a `_v=<timestamp>` cache-bust param. Guards: skips when offline, skips when already on a `_v=` URL to prevent reload loops. This is the recovery path when the React bundle itself can't run — the in-app `ReloadPrompt` banner needs the bundle to render, so a fully stuck client needs the HTML-level watchdog.
- Full web manifest with icons (64, 192, 512, maskable) for home screen install
- `display: 'standalone'` for native app feel

**MCP Server** — Exposes annotated tRPC procedures as MCP tools via `@modelcontextprotocol/sdk`. Two auth paths on the same `/api/mcp` endpoint:
- **Clerk OAuth** (Claude.ai custom connectors, Cursor, VS Code, etc.) — Clerk acts as OAuth 2.1 authorization server via Dynamic Client Registration. `@clerk/mcp-tools` generates the RFC 9728 protected-resource metadata and proxies Clerk's RFC 8414 auth-server metadata. On 401, the `WWW-Authenticate` header points clients to the resource metadata URL.
- **Personal access tokens** (Claude Code CLI, scripts) — bearer token from Settings > API Tokens.

Stateless mode (new server per request). Only procedures with `.meta({ description })` are exposed. Tool names follow the pattern `namespace_method` (e.g., `recipe_list`). Requires `nodejs_compat` flag in `wrangler.toml` (for `Buffer` used by `@clerk/mcp-tools`).

Two model-orientation channels, both in `workers/functions/lib/mcp-instructions.ts`:
- **`MCP_INSTRUCTIONS`** — passed to the `McpServer` constructor (`instructions` option), returned in the `initialize` handshake and surfaced by clients automatically (no tool call). GLOBAL (identical for every user, re-sent each handshake) so it holds only the irreducible frame + the few tool caveats agents get wrong. Keep it tight — it is paid on every connection. Strictly user-agnostic: never put one user's body metrics, program, or preferences here (it broadcasts to all clients).
- **`WORKOUT_GUIDE`** — long-form conventions reference returned on demand by the no-arg `workout.guide` query (tool `workout_guide`). Depth the always-on instructions shouldn't carry. Per-user state (active program, sessions, body metrics) is pulled live from data tools, not encoded here.

All list pages show public content with "All" / "Mine" filter chips. User's own items have accent border and "yours" badge. Edit/delete only available for owned items.

## Gotchas

Silent failures and runtime-only issues — things `yarn check` won't catch.

**Cloudflare / D1**
- Secrets live in the CF dashboard, never as `[vars]` in `wrangler.toml` (collision causes "Binding name already in use" on deploy)
- `worker-configuration.d.ts` is gitignored and regenerated by `yarn generate:wrangler` (which runs as part of `yarn generate` → `yarn check`/`yarn build`). The script invokes `wrangler types --env-file .dev.vars.template` against the committed `workers/.dev.vars.template` (placeholder values) so output is identical locally and in CI regardless of which secrets the dev has in `.dev.vars`. Resolves [workers-sdk#11038](https://github.com/cloudflare/workers-sdk/issues/11038); previously the file was committed with locally-generated content, which forced wrangler/workerd version drift to show up as huge diffs and broke CI any time the file got regenerated without `.dev.vars`. **Don't drop the `--env-file` flag** — without it wrangler reads `.dev.vars` (drifting per-machine) and the output stops being reproducible.
- CI needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — the latter bypasses `/memberships` which fails with scoped tokens
- `wrangler d1 execute --file` resolves paths from the workspace wrangler runs in, not cwd. Use absolute paths in scripts.
- **Wrangler `d1 migrations apply` only reads flat `*.sql` files** — Drizzle v1 beta generates `<tag>/migration.sql` subdirectories that wrangler silently skips. `yarn db:generate` runs a post-step (`db:flatten`) that copies each `<tag>/migration.sql` → `<tag>.sql` with `IF NOT EXISTS` added to `CREATE TABLE`/`CREATE INDEX` statements (makes migrations idempotent if tracking drifts). Both the subdirs (for drizzle-kit) and flat copies (for wrangler) are committed. After `db:generate`, always commit the new flat `.sql` file alongside the subdirectory.
- D1 supports FTS5 but Drizzle can't model it — use raw SQL migrations + `db.all()` queries
- `wrangler d1 export` errors on virtual tables (FTS5). Use `d1 time-travel` for backups instead.
- D1 has no Drizzle transactions — use `db.batch([stmt1, stmt2])` for atomic multi-statement writes
- D1 has a 100-bound-param limit per statement; insert chunk size = `floor(100 / cols)` (10 cols → 10 rows)

**CF Pages routing**
- Pages Functions route by filesystem path. `functions/api/[[route]].ts` only receives `/api/*` — Hono routes for paths outside that prefix silently fall through to SPA. New top-level paths need a new file at the literal path (e.g. `functions/.well-known/oauth-authorization-server.ts`). Dotted directory names work.
- Pages Function responses without a `Cache-Control` header get Cloudflare's default browser TTL injected (`max-age=14400`). Synthetic error responses must set `Cache-Control: no-store` explicitly — a cacheable 404 from the `[[catchall]]` during a deploy window poisons the client's HTTP cache for 4h and blocks every SW precache retry (browser stuck on old version, no update banner).

**React Router framework mode (SPA)**
- `ssr: false` in `react-router.config.ts` — RR still pre-renders the root route at build time to generate `workers/dist/client/index.html`. Anything in `root.tsx` that touches browser-only APIs (e.g. `indexedDB` via `persistQueryClient`) must be gated behind `if (!import.meta.env.SSR) { ... }` or moved to `useEffect`, otherwise the prerender phase throws.
- Build output is `<buildDirectory>/client/` — the `client/` subfolder is structural and can't be flattened. We set `buildDirectory: 'workers/dist'` in `react-router.config.ts` and `pages_build_output_dir = "dist/client"` in `workers/wrangler.toml` to align CF Pages with RR's output.
- `vite-plugin-pwa` runs **before** RR emits `index.html` and the `assets/manifest-*.js` chunk, so neither lands in Workbox's precache (vite-plugin-pwa#809). Two-part fix: `additionalManifestEntries: [{ url: 'index.html', revision: <placeholder> }]` in `vite.config.ts` for the SPA shell, plus `scripts/fix-sw.ts` (postbuild) that (a) replaces that placeholder with the md5 of the emitted `index.html` and (b) finds the hashed `manifest-*.js` chunk and patches it into `precacheAndRoute([...])` in `sw.js`. Without both, `createHandlerBoundToURL("index.html")` throws `non-precached-url` at runtime and silently breaks every Workbox `runtimeCaching` strategy after that line. **The index.html revision MUST be a content hash, never a build timestamp (`Date.now()`)** — a timestamp makes every build produce a byte-different `sw.js`, so every deploy (even no-op client builds, which auto-deploy on each push to `main`) registers a "new" SW and re-fires the `ReloadPrompt` "New version available" banner indefinitely.
- Inline `<script>` tags in `root.tsx` `<head>` are blocked by build hooks. Self-heal + standalone-viewport scripts live as static files in `public/` and load via `<script src="/...">` — RR doesn't add `defer` so they run synchronously before the React bundle, which is the order the self-heal listener needs.
- `react-router build` requires a server runtime even in SPA mode (`@react-router/node` in dependencies, not devDependencies — RR's auto-detection looks at the dependencies field). Without it: `Could not determine server runtime` at typegen/build.
- `routes.ts` uses `flatRoutes()` from `@react-router/fs-routes` over `src/routes/`. Flat-file convention: `recipes.$id.tsx` = `/recipes/:id`; `recipes.$id_.cook.tsx` (trailing underscore) = `/recipes/:id/cook` as a sibling, NOT nested under the `:id` parent. Without the trailing underscore, RR nests cook inside an Outlet on the editor page.
- Test runs need `reactRouter()` gated off (`!process.env.VITEST`) in `vite.config.ts` plugins array, otherwise vitest tries to resolve route modules and fails.

**MCP server**
- Use `CfWorkerJsonSchemaValidator` from `@modelcontextprotocol/sdk/validation/cfworker` (Workers can't use AJV — dynamic eval). Needs `@cfworker/json-schema` peer dep.
- Short-circuit `GET` and `DELETE` on `/api/mcp` with `405 Method Not Allowed` + `Allow: POST` **before** the SDK runs. The stateless SSE handler hangs the CF runtime; spec-compliant clients fall back to POST-only JSON-RPC.

**Drizzle ORM v1**
- `defineRelations` replaces separate `relations()` calls (`fields/references` → `from/to`, `relationName` → `alias`)
- `r.one` defaults to `optional: true` — set `optional: false` on relations whose FK column is `.notNull()` to avoid `T | null` in loaded relations
- Subquery `in` doesn't accept builders directly: `{ id: { RAW: t => inArray(t.id, sub) } }`
- Migration folder is one directory per migration (`tag/migration.sql` + `tag/snapshot.json`), no `meta/_journal.json`
- `drizzle-kit` drops `ON DELETE` from `ALTER TABLE ... ADD ... REFERENCES`. New tables in `CREATE TABLE` are fine, but additive `ALTER TABLE` columns need a manual edit to re-add `ON DELETE SET NULL` (or whichever) after `REFERENCES x(id)`.
- `drizzle-kit` emits `snapshot.json` with 2-space indent; biome formats with tabs. Run `yarn fix` after `yarn db:generate` or expect a lint failure on the snapshot.

**Backend / tRPC**
- Ownership checks belong on **all** mutations including sub-resources (`addIngredient`, `updateIngredient`, `removeIngredient`, `addSubrecipe`) — not just top-level CRUD
- Always index foreign keys on new tables: `t => [index('table_fk_idx').on(t.fkColumn)]`
- `userSettings` rows are NOT auto-created on signup. Mutations writing to it must upsert or call `ensureUserSettingsRow(userId)` first; bare `UPDATE` silently no-ops for new users.
- Pure utility functions (date helpers, math, formatting) go in `src/lib/`, not feature-specific `utils/` folders
- `workers/` workspace cannot import from `src/` (separate tsconfig + Workers runtime). Pure logic shared between frontend and backend lives in `packages/db/` (precedent: `packages/db/formulas.ts` for workout math, `packages/db/muscle-load.ts` for muscle aggregation). The frontend re-exports via `src/lib/workouts/formulas.ts` so existing `~/lib/workouts/formulas` imports keep working.

**CI / build**
- Builds that resolve version via `git describe --tags` need `fetch-depth: 0` on `actions/checkout`. Default is shallow → `git describe` throws → silent fallback to default version string.
- `prek install` only sets up pre-commit, not pre-push. Prek's `priority` field allows parallel hook execution at the same priority.
- `wrangler pages deploy` auto-pulls the git HEAD commit message and ships it to the CF API in a path that mangles multibyte UTF-8, failing with `Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]` — the bytes ARE valid UTF-8; wrangler's serialization isn't. Commit messages (subject + body + footer) are enforced ASCII-only via `commitlint.config.js`. Don't relax this without also wiring `--commit-message="$(git log -1 --format=%s)"` into the deploy workflow.

**Yarn 4** — `yarn workspaces foreach` needs `run`: `yarn workspaces foreach --all --parallel run typecheck`. Also: `yarn workspace <name> <bin> --env-file path` is intercepted by Node 24's own `--env-file` parser and fails with `node: <path>: not found` even though `<bin> --env-file path` works directly. Wrap the binary in a script field on the workspace's package.json (e.g. `"generate:wrangler": "wrangler types --env-file .dev.vars.template"`) and call via `yarn workspace <name> run generate:wrangler`.

**Zustand** — never subscribe to the entire store (`const store = useStore()` infinite-loops any effect with `store` in deps). Selectors only: `useStore(s => s.field)` for reactive state, `useStore.getState().action()` for callbacks.

**html5-qrcode** — `scanner.stop()` throws **synchronously** (not as a rejected Promise) if the scanner never reached RUNNING. React Strict Mode's dev double-mount triggers this every time: first mount's cleanup fires before async `start()` resolves. A bare `.stop().catch()` won't catch the sync throw — wrap the whole call in `try/catch` in the effect cleanup of `BarcodeScanner.tsx`.

**CSS**
- `field-sizing: content` for auto-sizing inputs to their content (no JS sizing or fixed widths)
- In `table-layout: auto`, changing column width on hover (even via `min-w`) recalculates every row. Hover styles in table cells should be opacity/color only.
- `grid` without an explicit `grid-cols-*` falls back to `grid-auto-columns: auto`, which sizes columns to **max-content**. A child card with `min-w-0 flex-1` + `truncate` won't engage truncation because the column already grew to fit un-truncated text — overflowing the viewport. For vertical card lists, always use `grid grid-cols-1 gap-*` (= `minmax(0, 1fr)`) so the column can shrink to container width.

## After Making Changes

Keep documentation in sync:

- **New routes/features** → Update API Structure section above + README.md
- **New design tokens** → Update Design Tokens section above
- **New components/patterns** → Update Patterns section above
- **New commands** → Update Commands section above + README.md
- **Schema changes** → Update README.md project structure if new tables added
