# macromaxxing

A recipe nutrition tracker and workout logger for fitness enthusiasts who meal prep. Track macros per portion, plan weekly meals, and log workouts with biomechanical validation.

## Features

- **Recipe Management** — Create recipes with ingredients, track cooked weight vs raw weight, define portion sizes. Supports subrecipes (recipes as components of other recipes)
- **Recipe Import** — Import recipes from URLs (JSON-LD structured data → AI fallback) or pasted text
- **Premade Meals** — Add pre-made products via nutrition label data or URL parsing
- **Macro Visualization** — MacroRing (donut chart showing P/C/F caloric ratio), MacroBar (stacked horizontal bar), per-portion readouts
- **Ingredient Units** — AI-populated unit conversions (tbsp, scoop, pcs) with gram equivalents; density-based volume calculations
- **Preparation Tracking** — Auto-extracts preparation descriptors ("minced", "finely chopped") from ingredient names
- **AI-Powered Ingredient Lookup** — USDA FoodData Central API priority, AI fallback (Gemini/OpenAI/Anthropic BYOK). Batch lookups and model fallback configurable per user
- **Weekly Meal Planning** — Template-based weekly planner with per-plan recipe inventory and portion tracking
- **Workout Tracking** — Template-based training with checklist-driven session logging, supersets, auto-generated warmup/backoff sets, fatigue-tier-based rest timers, and interactive body map
- **Auth** — Google/GitHub OAuth via Clerk
- **Responsive Design** — Two-column editor on desktop, mobile-first with bottom tab navigation

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite 7 + Tailwind CSS 4
- tRPC + TanStack Query for data fetching
- react-router-dom for routing
- @dnd-kit for drag-and-drop (ingredient reordering, meal plan allocation)

**Backend:**
- Cloudflare Pages Functions (Hono + tRPC)
- Cloudflare D1 (SQLite) with Drizzle ORM
- Clerk for authentication (cookie-based sessions)
- AES-GCM encrypted API key storage

## Project Structure

```
src/
├── components/
│   ├── layout/              # RootLayout, Nav (desktop top + mobile bottom tabs + RestTimer)
│   └── ui/                  # Button, Card, Input, NumberInput, Select, Switch, Spinner, etc.
├── features/
│   ├── recipes/
│   │   ├── components/      # MacroRing, MacroBar, MacroReadout, PortionPanel, RecipeImportDialog,
│   │   │                    #   PremadeDialog, SubrecipeExpandedRows, IngredientSearchInput, etc.
│   │   ├── hooks/           # useRecipeCalculations
│   │   ├── utils/           # macros.ts, format.ts
│   │   ├── RecipeListPage.tsx
│   │   └── RecipeEditorPage.tsx
│   ├── ingredients/
│   │   ├── components/      # IngredientForm
│   │   └── IngredientListPage.tsx
│   ├── mealPlans/
│   │   ├── components/      # InventorySidebar, WeekGrid, DayColumn, MealCard, DayTotals,
│   │   │                    #   WeeklyAverages, SlotPickerPopover, etc.
│   │   ├── MealPlanListPage.tsx
│   │   └── MealPlannerPage.tsx
│   ├── workouts/
│   │   ├── components/      # BodyMap, ExerciseSetForm, SetRow, SupersetForm, SessionReview,
│   │   │                    #   TimerMode, TimerRing, RestTimer, ExerciseSearch, ImportDialog, etc.
│   │   ├── utils/           # formulas.ts, sets.ts, export.ts
│   │   ├── RestTimerContext.tsx
│   │   ├── WorkoutListPage.tsx
│   │   ├── WorkoutTemplatePage.tsx
│   │   └── WorkoutSessionPage.tsx
│   └── settings/
│       └── SettingsPage.tsx
├── lib/
│   ├── trpc.ts              # tRPC client setup
│   ├── user.tsx             # useUser() hook (Clerk)
│   └── cn.ts                # clsx + tailwind-merge utility
└── index.css                # Design tokens (surfaces, ink, macro colors, etc.)

packages/db/                 # Shared package @macromaxxing/db
├── schema.ts                # All tables (users, ingredients, recipes, mealPlans, workouts, etc.)
├── relations.ts             # Drizzle relations
├── types.ts                 # Inferred types
├── custom-types.ts          # TypeID helpers, AiProvider, FatigueTier, MuscleGroup, SetMode, etc.
└── preparation.ts           # Preparation descriptor extraction

workers/functions/
├── api/[[route]].ts         # Hono entry: Clerk auth middleware → tRPC handler
└── lib/
    ├── router.ts            # tRPC app router (recipe, ingredient, mealPlan, workout, ai, settings, user)
    ├── trpc.ts              # tRPC context + procedures
    ├── auth.ts              # Clerk cookie verification
    ├── db.ts                # Drizzle D1 setup
    ├── ai-utils.ts          # Multi-provider AI client, model fallback, JSON-LD extraction
    ├── crypto.ts            # AES-GCM encryption helpers
    ├── constants.ts         # Shared constants + Zod schemas
    ├── utils.ts             # toStartCase, extractPreparation, etc.
    └── routes/
        ├── recipes.ts       # CRUD + ingredients + subrecipes + premade meals
        ├── ingredients.ts   # CRUD + findOrCreate + batchFindOrCreate + units
        ├── mealPlans.ts     # CRUD + inventory + slot allocation
        ├── workouts.ts      # Exercises, templates, sessions, sets, muscle stats, import
        ├── ai.ts            # lookup, estimateCookedWeight, parseRecipe, parseProduct
        ├── settings.ts      # AI config + body profile
        └── user.ts          # User endpoints

scripts/
└── seed-exercises.ts        # System exercises with muscle group mappings + strength standards
```

## AI Features

**Nutrition lookup priority:** USDA FoodData Central API → AI (user's configured provider)

| Provider | Default Model | Fallback Chain |
|----------|---------------|----------------|
| Gemini | `gemini-2.5-flash` | → `gemini-2.5-flash-lite-preview` → `gemma-3-27b-it` |
| OpenAI | `gpt-4o-mini` | — |
| Anthropic | `claude-sonnet-4-20250514` | — |

**Capabilities:**
- Ingredient nutritional data lookup (macros, density, units per 100g raw)
- Recipe parsing from URLs (JSON-LD structured data) or text (AI)
- Product nutrition parsing from URLs (JSON-LD Product → AI fallback)
- Cooked weight estimation from ingredients + instructions
- Batch ingredient lookups (single AI call for multiple ingredients)
- Model fallback on rate limits (429 → next model in chain)

**Per-user settings** (both off by default):
- `batchLookups` — batch N ingredient AI calls into 1
- `modelFallback` — retry with cheaper models on 429

## Design System

Dark theme with warm soapstone undertones. Key tokens in `src/index.css`:

- **Surfaces:** `surface-0` (base), `surface-1` (cards), `surface-2` (hover/elevated)
- **Ink:** `ink` (primary text), `ink-muted` (secondary), `ink-faint` (tertiary)
- **Macro colors:** `macro-protein` (copper), `macro-carbs` (golden), `macro-fat` (olive), `macro-kcal` (warm orange), `macro-fiber` (sage)
- **Accent:** Copper (`oklch(0.72 0.15 50)`)
- **Depth:** Borders-only strategy (no shadows), `edge` border color
- **Radius:** Sharp (`4px`/`6px`) for instrument-grade precision

## Development

```bash
# Install dependencies
yarn

# Run dev server (frontend + backend)
yarn dev

# Build
yarn build

# Lint/format
yarn fix

# Database migrations
yarn db:generate   # Generate migration from schema changes
yarn db:migrate    # Apply migrations to local D1

# Run tests
yarn test
```

## Environment Variables

**Frontend** (`.env.local`):
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key

**Workers** (`.dev.vars` locally, Cloudflare dashboard for production):
- `ENCRYPTION_SECRET` — 32-byte hex string for AES-GCM key encryption
- `USDA_API_KEY` — USDA FoodData Central API key
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key
- `CLERK_SECRET_KEY` — Clerk secret key

## License

MIT
