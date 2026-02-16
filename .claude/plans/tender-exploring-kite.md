# Import USDA Foundation + SR Legacy into Local D1

## Context

Ingredient lookups currently hit the USDA FoodData Central API on every search/create. By importing Foundation Foods + SR Legacy (~8,000 foods) into local D1 tables, we can serve exact matches instantly without API calls. The USDA API remains the primary search/lookup mechanism — local data is only used when we have a confident exact match (case-insensitive name or fdcId). Correctness is the #1 priority.

## 1. New Tables

Add to `packages/db/schema.ts`:

**`usda_foods`** — denormalized with macro columns (we only need 5 out of ~150 nutrients):
- `fdc_id` integer PK (USDA's own ID, no TypeID needed)
- `description` text
- `data_type` text ('foundation' | 'sr_legacy')
- `protein`, `carbs`, `fat`, `kcal`, `fiber` — real, per 100g
- `density` real nullable (calculated from volume portions during import)

**`usda_portions`** — one-to-many from foods:
- `id` integer PK autoincrement
- `fdc_id` integer FK → usda_foods
- `name` text (normalized: 'cup', 'tbsp', 'pcs', etc.)
- `grams` real (grams per 1 unit)
- `is_volume` integer (1 = volume unit derived from density)

Add index on `usda_foods(lower(description))` for exact case-insensitive lookups.
Add relations in `packages/db/relations.ts`, types in `packages/db/types.ts`.

## 2. Migration

1. `yarn db:generate` → creates migration with the two regular tables
2. Manually append to the generated migration SQL:
   - Index on `usda_portions(fdc_id)`
   - Index on `usda_foods` description for case-insensitive lookup
3. `yarn db:migrate` to apply locally

## 3. Import Script

Create `scripts/seed-usda.ts` following existing `seed-exercises.ts` pattern:

1. Download Foundation + SR Legacy CSV zips from USDA FDC (cache in `.usda-cache/`, gitignored)
2. Parse `food.csv` → food descriptions
3. Parse `food_nutrient.csv` → extract 5 macro nutrients per food (IDs: 1003, 1004, 1005, 1008, 1079)
4. Parse `food_portion.csv` → normalize unit names via existing `KNOWN_UNITS` set, calculate density from volume portions via `densityFromPortions` logic
5. Generate `INSERT OR REPLACE` statements, batch 500 rows per execution (D1 size limits)
6. Execute via `wrangler d1 execute` with `--local` or `--remote` flag

Add `"db:seed:usda"` script to `package.json`.

## 4. Search Integration

**Principle: exact match only.** Local USDA data is used when we have a confident match (exact case-insensitive name or fdcId). If no exact match, fall through to existing USDA API flow. Correctness > speed.

### New helper functions in `workers/functions/lib/ai-utils.ts`:

**`lookupLocalUSDA(db, name)`** — exact case-insensitive match on `usda_foods.description`:
- `WHERE lower(description) = lower(name)`
- Returns `UsdaResult | null`

**`getLocalUsdaFood(db, fdcId)`** — lookup by fdcId:
- Returns the food row with macros + density, or null

**`fetchLocalUsdaPortions(db, fdcId)`** — Drizzle query on `usdaPortions`:
- Returns `UsdaPortion[]` (same type as existing `fetchUsdaPortions`)

### Modified endpoints in `workers/functions/lib/routes/ingredients.ts`:

**`searchUSDA`** — no change (keeps using USDA API for search, since search needs relevance ranking, not exact match)

**`createFromUSDA`** — read from local tables by fdcId:
- Check `usda_foods` for the fdcId → use local macros + density + portions
- Fall back to API fetch if fdcId not in local tables

**`findOrCreate`** — exact match on local, then existing API flow:
- After DB check, try `lookupLocalUSDA(db, normalizedName)`
- If found → use local macros, `fetchLocalUsdaPortions` for portions
- If not found → existing `lookupUSDA(name, apiKey)` API flow (unchanged)

**`batchFindOrCreate`** — same exact-match-first pattern

### Modified endpoint in `workers/functions/lib/routes/ai.ts`:

**`ai.lookup`** — exact match on local, then existing API flow

### Frontend — no changes needed
The API shapes don't change. `IngredientSearchInput.tsx` works as-is.

## Files to Modify

| File | Change |
|------|--------|
| `packages/db/schema.ts` | Add `usdaFoods`, `usdaPortions` tables |
| `packages/db/relations.ts` | Add relations |
| `packages/db/types.ts` | Add `UsdaFood`, `UsdaPortion` types |
| `workers/functions/lib/ai-utils.ts` | Add `lookupLocalUSDA`, `getLocalUsdaFood`, `fetchLocalUsdaPortions` |
| `workers/functions/lib/routes/ingredients.ts` | Exact-match-first in `createFromUSDA`, `findOrCreate`, `batchFindOrCreate` |
| `workers/functions/lib/routes/ai.ts` | Local-first in `ai.lookup` |
| `scripts/seed-usda.ts` | **New** — download + import script |
| `package.json` | Add `db:seed:usda` script |
| `.gitignore` | Add `.usda-cache/` |
| Generated migration | Append indexes |
| `CLAUDE.md` | Update DB Schema + Commands sections |

## Verification

1. `yarn db:migrate` — tables created
2. `yarn db:seed:usda` — imports ~8,000 foods + portions
3. `yarn dev` → search for "chicken breast" → USDA results still appear (API search unchanged)
4. Select a USDA result → ingredient created from local data (no second API call)
5. `findOrCreate("Chicken, breast, skinless, boneless, raw")` → exact match from local table
6. `yarn typecheck` — no type errors
7. `yarn test` — existing tests pass
