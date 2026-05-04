# Show USDA search results in ingredient search dropdown

## Context

When adding ingredients to a recipe, the search dropdown only matches against local DB ingredients. USDA data is only used behind the scenes by `findOrCreate` which auto-picks the "best" USDA match. The user never sees or chooses from USDA results, which means they can't pick the right variant (e.g. "Chicken breast, raw" vs "Chicken breast, cooked, roasted").

## Approach

Add a new `ingredient.searchUSDA` tRPC query that proxies the USDA search API and returns scored results with macros. The frontend fires this as a debounced query alongside local search, and renders USDA results in a separate section of the dropdown (like recipes are shown today). When the user picks a USDA result, we call a new `ingredient.createFromUSDA` mutation that creates the ingredient from a specific `fdcId`.

## Changes

### 1. New backend query: `ingredient.searchUSDA`
**File:** `workers/functions/lib/routes/ingredients.ts`

Add a `publicProcedure` query (no auth required — USDA key is a server env var):
- Input: `{ query: string }` (min 2 chars)
- Calls `lookupUSDA`-style fetch but returns **all scored results** instead of just the best one
- Returns: `Array<{ fdcId: number, description: string, protein, carbs, fat, kcal, fiber }>`
- Sort by `scoreUsdaMatch` descending, limit to top 5

Extract USDA search + nutrient parsing logic from `lookupUSDA` in `ai-utils.ts` into a new `searchUSDA` function that returns all results (not just the best). Keep `lookupUSDA` as a thin wrapper that calls `searchUSDA` and picks the best.

### 2. New backend mutation: `ingredient.createFromUSDA`
**File:** `workers/functions/lib/routes/ingredients.ts`

Add a `protectedProcedure` mutation:
- Input: `{ fdcId: number, name: string }` — name from USDA description (user sees it)
- Check if ingredient with same `fdcId` already exists → return it
- Fetch portions via existing `fetchUsdaPortions`
- Create ingredient + units (reuse the existing USDA creation logic from `findOrCreate`)
- Returns `{ ingredient, source: 'existing' | 'usda' }`

### 3. Frontend: USDA results in dropdown
**File:** `src/features/recipes/components/IngredientSearchInput.tsx`

- Add `trpc.ingredient.searchUSDA.useQuery` with `enabled: search.length >= 2`, debounced by ~300ms using search state
- Render USDA results section below local results (similar pattern to the "Recipes" section), with a `USDA` header
- Filter out USDA results that match already-shown local ingredients (by `fdcId`)
- Each USDA row shows: description + macro summary (p/c/f) + MacroBar
- On click: call `createFromUSDA` → then `addIngredient` to the recipe
- Show spinner on the clicked item while creating

### 4. Debounce
- Use a simple `debouncedSearch` state pattern: update `debouncedSearch` via `setTimeout`/`useEffect` with 300ms delay
- The USDA query uses `debouncedSearch` as input, local fuzzy search keeps using `search` (instant)

## Files to modify
1. `workers/functions/lib/ai-utils.ts` — extract `searchUSDA` from `lookupUSDA`
2. `workers/functions/lib/routes/ingredients.ts` — add `searchUSDA` query + `createFromUSDA` mutation
3. `src/features/recipes/components/IngredientSearchInput.tsx` — USDA section in dropdown + debounce

## Verification
1. `yarn typecheck` — no type errors
2. `yarn dev` — open recipe editor, type ingredient name, see USDA results appear below local results after 300ms
3. Click a USDA result → ingredient created and added to recipe
4. Click same USDA result again → reuses existing ingredient (fdcId dedup)
