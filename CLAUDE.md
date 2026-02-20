# Macromaxxing

Recipe nutrition tracker for meal preppers. Track macros per portion.

## Code Style

- Indentation: tabs (not spaces) in all files

## Stack

- **Frontend:** React 19, Vite 7, Tailwind 4, tRPC, react-router-dom, PWA (vite-plugin-pwa + Workbox)
- **Backend:** Cloudflare Pages Functions (Hono + tRPC), D1 (SQLite), R2 (images), Drizzle ORM
- **Auth:** Cookie-based via Clerk (Google/GitHub OAuth), user ID in context
- **AI:** Multi-provider (Gemini/OpenAI/Anthropic), BYOK, keys encrypted with AES-GCM

## Commands

```bash
yarn dev          # Full local dev (frontend + API + local D1)
yarn dev:web      # Frontend only (API_URL defaults to localhost:8788)
yarn dev:api      # API only (wrangler + local D1 on port 8788)
yarn dev:remote   # Frontend only (proxies to production API)
yarn build        # Build
yarn preview      # Preview build with local D1
yarn fix          # Lint + format (Biome)
yarn db:generate  # Generate migration from schema
yarn db:migrate   # Apply migrations to local D1
yarn db:seed:usda # Import USDA Foundation + SR Legacy foods into local D1
yarn test         # Run tests (Vitest)
```

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
  main.tsx                                  # App entry (Clerk provider + RouterProvider)
  router.tsx                                # All routes (see Routes below)
  index.css                                 # Design tokens + Tailwind
  lib/
    trpc.ts                                 # tRPC react-query client
    user.tsx                                # useUser() hook (Clerk)
    cn.ts                                   # cn() utility (clsx + twMerge)
    images.ts                               # getImageUrl, isExternalImage, getImageAttribution (R2/external URL)
  components/
    ui/                                     # Button, Input, NumberInput, Select, Switch, Card, Spinner, ReloadPrompt, etc.
    layout/Nav.tsx                           # Top nav + mobile bottom tabs + RestTimer
    layout/RootLayout.tsx                    # Shell: nav + <Outlet />
    ErrorBoundary.tsx
  features/
    dashboard/
      DashboardPage.tsx                   # Home page: today's meals, macro progress, workouts, recent sessions
    recipes/
      RecipeListPage.tsx                    # List with All/Mine filter, search, import/premade dialogs
      RecipeEditorPage.tsx                  # Create/edit recipe (ingredients table, macros, portions)
      CookModePage.tsx                      # Read-only cook mode with batch scaling, ingredient checklist, method steps
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
      IngredientListPage.tsx                # List with All/Mine filter, inline edit form
      components/IngredientForm.tsx          # Add/edit ingredient form
    mealPlans/
      MealPlanListPage.tsx                  # List/create/delete meal plans
      MealPlannerPage.tsx                   # Weekly planner: inventory sidebar + 7-day grid
      components/                           # InventorySidebar, InventoryCard, AddToInventoryModal,
                                            #   WeekGrid, DayColumn, MealSlot, MealCard, MealPopover,
                                            #   SlotPickerPopover, DayTotals, WeeklyAverages
    workouts/
      WorkoutListPage.tsx                   # Workout templates list + body map + recent sessions
      WorkoutTemplatePage.tsx               # Create/edit workout template (exercises, targets, supersets)
      WorkoutSessionPage.tsx                # Active session: checklist model with pre-filled planned sets
      ProgressionPage.tsx                   # 1RM trends + weekly muscle volume charts over time
      WorkoutMode.tsx                       # Workout execution mode
      RestTimerContext.tsx                   # Global rest timer + session state (persists across pages)
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
        TimerMode.tsx                       # Full-screen timer overlay (child route)
        TimerRing.tsx                       # SVG circular timer progress ring
        RestTimer.tsx                       # Nav timer widget (countdown / elapsed / session link)
        ImportDialog.tsx                    # Import workouts from spreadsheet/CSV
        ProfileForm.tsx                     # Body profile inputs (height/weight/sex)
      utils/
        formulas.ts                         # estimated1RM, limbLengthFactor, totalVolume, BMR/TDEE, computeDivergences
        sets.ts                             # generateWarmupSets, generateBackoffSets, calculateRest, shouldSkipWarmup
        export.ts                           # Workout data export
    settings/SettingsPage.tsx               # AI provider/key config, batch/fallback toggles, body profile
packages/db/                                # Shared package @macromaxxing/db
  schema.ts                                 # All tables (see DB Schema below)
  relations.ts                              # Drizzle relations
  types.ts                                  # Inferred types (Recipe, Ingredient, Exercise, Workout, etc.)
  custom-types.ts                           # typeidCol, newId, AiProvider, FatigueTier, MuscleGroup, SetMode, etc.
  preparation.ts                            # Preparation descriptor extraction (extractPreparation)
workers/functions/
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
      ai.ts                                 # ai.* endpoints
      settings.ts                           # settings.* endpoints
      user.ts                               # user.* endpoints
scripts/
  seed-exercises.ts                         # System exercises with muscle group mappings + strength standards
  seed-usda.ts                              # Import USDA Foundation + SR Legacy foods into D1
```

## Routes

```
/                                    → DashboardPage (signed-in) / redirect to /recipes (signed-out)
/recipes                             → RecipeListPage
/recipes/new                         → RecipeEditorPage
/recipes/:id                         → RecipeEditorPage
/recipes/:id/cook                    → CookModePage
/ingredients                         → IngredientListPage
/plans                               → MealPlanListPage
/plans/:id                           → MealPlannerPage
/workouts                            → WorkoutListPage
/workouts/progression                → ProgressionPage
/workouts/new                        → WorkoutTemplatePage
/workouts/:workoutId                 → WorkoutTemplatePage
/workouts/:workoutId/session         → WorkoutSessionPage (new session from template)
/workouts/sessions/:sessionId        → WorkoutSessionPage (existing session)
/workouts/sessions/:sessionId/timer  → TimerMode (nested child route)
/settings                            → SettingsPage
```

## DB Schema

```
users(id PK clerk_user_id, email)
  → userSettings(userId FK, aiProvider, aiApiKey encrypted, aiModel, batchLookups, modelFallback,
                 heightCm?, weightKg?, sex: male|female)

ingredients(id typeid:ing, userId, name, protein/carbs/fat/kcal/fiber per 100g raw, density?, fdcId?, source: manual|ai|usda|label)
  → ingredientUnits(id typeid:inu, ingredientId, name e.g. tbsp/scoop/pcs, grams, isDefault, source)

recipes(id typeid:rcp, userId, name, type: recipe|premade, instructions?, cookedWeight?, portionSize?, isPublic, sourceUrl?, image?)
  → recipeIngredients(id typeid:rci, recipeId, ingredientId?, subrecipeId?, amountGrams, displayUnit?, displayAmount?, preparation?, sortOrder)

mealPlans(id typeid:mpl, userId, name)
  → mealPlanInventory(id typeid:mpi, mealPlanId, recipeId, totalPortions)
    → mealPlanSlots(id typeid:mps, inventoryId, dayOfWeek 0=Mon..6=Sun, slotIndex, portions default 1)

exercises(id typeid:exc, userId?, name, type: compound|isolation, fatigueTier: 1-4)
  → exerciseMuscles(id typeid:exm, exerciseId, muscleGroup, intensity 0.0-1.0)

strengthStandards(id typeid:ssr, compoundId FK, isolationId FK, maxRatio)

workouts(id typeid:wkt, userId, name, trainingGoal: hypertrophy|strength, sortOrder)
  → workoutExercises(id typeid:wke, workoutId, exerciseId, sortOrder, targetSets?, targetReps?, targetWeight?,
                     setMode: working|warmup|backoff|full, supersetGroup?)

workoutSessions(id typeid:wks, userId, workoutId?, name?, startedAt, completedAt?, notes?)
  → sessionPlannedExercises(id typeid:spe, sessionId, exerciseId, sortOrder, targetSets?, targetReps?,
                            targetWeight?, setMode, trainingGoal?, supersetGroup?)
  → workoutLogs(id typeid:wkl, sessionId, exerciseId, setNumber, setType: warmup|working|backoff,
                weightKg, reps, rpe?, failureFlag)

usda_foods(fdc_id PK integer, description, data_type: foundation|sr_legacy, protein/carbs/fat/kcal/fiber per 100g, density?)
  → usda_portions(id autoincrement PK, fdc_id FK, name, grams, is_volume)
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
- Buttons use `Button` with variants: `default`, `destructive`, `outline`, `ghost`
- Cards use `Card`, `CardHeader`, `CardContent` from `~/components/ui/Card`
- tRPC client: `import { trpc } from '~/lib/trpc'`
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
trpc.workout.listExercises/createExercise   # System + user exercises with muscle mappings
trpc.workout.listWorkouts/getWorkout/createWorkout/updateWorkout/reorderWorkouts/deleteWorkout
trpc.workout.listSessions/getSession/createSession/completeSession/deleteSession
trpc.workout.addSet/updateSet/removeSet
trpc.workout.muscleGroupStats               # Volume per muscle group (weighted by intensity) over N days
trpc.workout.exerciseProgression            # Best estimated 1RM + volume per session for an exercise over time
trpc.workout.volumeProgression              # Weekly volume per muscle group over configurable weeks
trpc.workout.coverageStats                  # Template muscle coverage for body map
trpc.workout.generateWarmup/generateBackoff # Auto-calculated warmup/backoff sets
trpc.workout.importWorkouts                 # Import workout templates from spreadsheet text
trpc.workout.importSets                     # Import sets from CSV/spreadsheet text
trpc.workout.listStandards                  # Compound-to-isolation strength ratio standards
trpc.dashboard.summary                      # Aggregated dashboard data: today's meals, recent sessions, workout templates
trpc.settings.get/save
trpc.ai.lookup                              # Returns { protein, carbs, fat, kcal, fiber, density, units[], source } per 100g
trpc.ai.estimateCookedWeight                # Returns { cookedWeight } based on ingredients + instructions
trpc.ai.parseRecipe                         # Parses recipe from URL (JSON-LD → AI fallback) or text (AI); returns imageUrl
trpc.ai.parseProduct                        # Parses product nutrition from URL (JSON-LD Product → AI fallback)

# Non-tRPC routes (raw Hono, multipart form data)
POST   /api/recipes/:id/image              # Upload recipe image to R2 (max 5MB, image/* only)
DELETE /api/recipes/:id/image              # Remove recipe image (cleans up R2 if upload)
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

**Public endpoints (no auth):** `recipe.list`, `recipe.get`, `ingredient.list` — all use `publicProcedure` (auth optional). Authenticated users see their own items in addition to public ones.

**Premade meals** — Tracked as `type: 'premade'` recipes backed by a single ingredient with `source: 'label'`. Premade recipes are always private (never shown to unauthenticated users). Backing ingredients are hidden from the ingredient list (`source != 'label'` filter).

**Recipe images** — Single `image` column stores either a recipe ID (R2 upload at `recipes/{id}`) or an `http*` URL (external, hotlinked). Upload/delete via raw Hono routes (`POST/DELETE /api/recipes/:id/image`) since tRPC doesn't support multipart. Frontend resolves via `getImageUrl()` from `~/lib/images`. External images show "from hostname" attribution. R2 objects are cleaned up on image removal and recipe deletion. Images extracted from JSON-LD during recipe URL imports.

**Subrecipes** — Recipes can be added as components of other recipes. `recipeIngredients` rows have either `ingredientId` or `subrecipeId` set (never both). Subrecipe macros are derived from the child recipe's ingredients and scale with portions. Cycle detection prevents circular references.

**Workouts** — Template-based training with checklist-driven session logging:
- **Templates** define exercises with target sets/reps/weight and set modes (working/warmup/backoff/full)
- **Sessions** are instances of templates with pre-filled planned sets — tap to confirm each set
- **Supersets** group exercises via `supersetGroup` integer — rendered as interleaved rounds with transition timers
- **Fatigue tiers** (1-4) on exercises drive dynamic rest duration: `reps × 4 × goalMultiplier + tierModifier`
- **Body map** shows muscle coverage per workout template using exercise-muscle intensity mappings
- **Session review** on completion compares actual vs. planned, offers to update template targets
- **Rest timer** persists globally (nav widget) — shows countdown, overshot time, or session elapsed
- **Timer route** (`/workouts/sessions/:id/timer`) renders as full-screen child route via `<Outlet>`
- Body profile (height/weight/sex) stored in `userSettings`, used for workout validation

**PWA** — Installable progressive web app via `vite-plugin-pwa`:
- Workbox precaches all static assets (`js, css, html, ico, png, svg, woff2`) with SPA `navigateFallback` (excludes `/api/`)
- `registerType: 'prompt'` — `ReloadPrompt` component shows update banner when new version is available
- Full web manifest with icons (64, 192, 512, maskable) for home screen install
- `display: 'standalone'` for native app feel

All list pages show public content with "All" / "Mine" filter chips. User's own items have accent border and "yours" badge. Edit/delete only available for owned items.

## After Making Changes

Keep documentation in sync:

- **New routes/features** → Update API Structure section above + README.md
- **New design tokens** → Update Design Tokens section above
- **New components/patterns** → Update Patterns section above
- **New commands** → Update Commands section above + README.md
- **Schema changes** → Update README.md project structure if new tables added
