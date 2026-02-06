# Macromaxxing

Recipe nutrition tracker for meal preppers. Track macros per portion.

## Stack

- **Frontend:** React 19, Vite 7, Tailwind 4, tRPC, react-router-dom
- **Backend:** Cloudflare Pages Functions (Hono + tRPC), D1 (SQLite), Drizzle ORM
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
```

## Key Files

| Task | Location |
|------|----------|
| DB schema & types | `packages/db/` (shared package `@macromaxxing/db`) |
| tRPC routes | `workers/functions/lib/routes/*.ts` |
| Macro calculations | `src/features/recipes/utils/macros.ts` |
| Design tokens | `src/index.css` |
| UI components | `src/components/ui/` |
| Recipe components | `src/features/recipes/components/` |
| Meal plan components | `src/features/mealPlans/components/` |

## Design Tokens

Use these Tailwind classes (defined in `src/index.css`):

**Surfaces:** `bg-surface-0` (base), `bg-surface-1` (cards), `bg-surface-2` (hover)
**Text:** `text-ink`, `text-ink-muted`, `text-ink-faint`
**Border:** `border-edge`
**Macro colors:** `text-macro-protein`, `text-macro-carbs`, `text-macro-fat`, `text-macro-kcal`, `text-macro-fiber`
**Accent:** `bg-accent`, `text-accent`, `hover:bg-accent-hover`
**Radius:** `rounded-[--radius-sm]` (4px), `rounded-[--radius-md]` (6px)
**Sizing:** Use `size-4` instead of `size-4`

No shadows — borders-only depth strategy.

## Patterns

- All numbers use `font-mono tabular-nums`
- Macro visualization: `MacroRing` (donut), `MacroBar` (stacked bar), `MacroReadout` (single value)
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
trpc.recipe.list/listPublic/get/getPublic/create/update/delete
trpc.recipe.addIngredient/updateIngredient/removeIngredient
trpc.ingredient.list/listPublic/create/update/delete/findOrCreate
trpc.ingredient.listUnits/createUnit/updateUnit/deleteUnit
trpc.mealPlan.list/get/create/update/delete/duplicate
trpc.mealPlan.addToInventory/updateInventory/removeFromInventory
trpc.mealPlan.allocate/updateSlot/removeSlot/copySlot
trpc.settings.get/save
trpc.ai.lookup  # Returns { protein, carbs, fat, kcal, fiber, density, units[], source } per 100g
trpc.ai.estimateCookedWeight # Returns { cookedWeight } based on ingredients + instructions
```

`ingredient.findOrCreate` - Checks DB for existing ingredient (case-insensitive, auto-normalizes to Start Case), then tries USDA API, falls back to AI if not found. Returns `{ ingredient, source: 'existing' | 'usda' | 'ai' }`. AI also populates units (tbsp, pcs, scoop, etc.) with gram equivalents.

**Meal Plans** - Template-based weekly meal planning with per-plan inventory:
- Add recipes to plan's inventory with portion count → allocate portions to day slots (Mon-Sun)
- Slots reference inventory items, enabling portion tracking (remaining = total - allocated)
- Over-allocation allowed with visual warning

**Nutrition lookup priority:** USDA FoodData Central API → AI (user's configured provider)

**Public endpoints (no auth):** `recipe.listPublic`, `recipe.getPublic`, `ingredient.listPublic`

All list pages show public content with "All" / "Mine" filter chips. User's own items have accent border and "yours" badge. Edit/delete only available for owned items.

## After Making Changes

Keep documentation in sync:

- **New routes/features** → Update API Structure section above + README.md
- **New design tokens** → Update Design Tokens section above
- **New components/patterns** → Update Patterns section above
- **New commands** → Update Commands section above + README.md
- **Schema changes** → Update README.md project structure if new tables added
