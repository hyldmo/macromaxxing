# Strip preparation descriptors from ingredient names + store on recipe ingredient

## Problem
Names like "Garlic Cloves, Minced" or "Onion, Finely Chopped" cause duplicate DB entries and worse USDA search results. The preparation method doesn't affect macros per 100g.

## Approach
Two-part fix:
1. **Extract** preparation from ingredient names → clean name for DB/USDA lookup
2. **Store** preparation on `recipeIngredients` so it's preserved for display

"Garlic Cloves, Minced" → ingredient: "Garlic Cloves", preparation: "minced"

---

## 1. Add `extractPreparation` utility

**File:** `workers/functions/lib/utils.ts`

Add a function that splits a name into `{ name, preparation }`:

```ts
extractPreparation("Garlic Cloves, Minced") → { name: "Garlic Cloves", preparation: "minced" }
extractPreparation("Finely Chopped Onion") → { name: "Onion", preparation: "finely chopped" }
extractPreparation("Ground Beef") → { name: "Ground Beef", preparation: null }
```

**Safe-to-strip descriptors** (pure preparation, never product names):
- Cutting: `chopped, minced, diced, sliced, julienned, cubed, shredded, grated, torn, halved, quartered`
- Prep: `peeled, trimmed, pitted, seeded, deseeded, cored, deboned, deveined, shelled, hulled`
- State: `melted, softened, chilled, cooled, thawed`
- Measurement: `divided, sifted, packed, heaping, level, rounded`

**Adverbs** (only stripped when followed by a descriptor):
`finely, coarsely, roughly, thinly, thickly, freshly, lightly`

**Keep** (affect nutrition or are product names):
`dried, frozen, canned, smoked, pickled, ground, crushed, roasted, raw, cooked, fresh, whole, boneless, skinless`

**Algorithm:**
1. Trailing comma pattern: strip everything after `,` if first word is descriptor/adverb
2. Leading pattern: strip `(adverb+)?descriptor` pairs from start, iteratively
3. Never strip last remaining word

Also add `normalizeIngredientName(name)` = `toStartCase` + strip preparation (discarding the preparation part) for places that just need the clean name.

## 2. Schema: add `preparation` column

**File:** `packages/db/schema.ts`

Add to `recipeIngredients`:
```ts
preparation: text('preparation'), // "minced", "finely chopped", etc.
```

Then `yarn db:generate` to create migration, `yarn db:migrate` to apply.

## 3. Backend route changes

### `workers/functions/lib/routes/recipes.ts`
- Add `preparation: z.string().nullable().optional()` to `addIngredientSchema` and `updateIngredientSchema`
- Pass `preparation` through in `addIngredient` and `updateIngredient` handlers

### `workers/functions/lib/routes/ingredients.ts`
- `create` (line 85): `toStartCase` → `normalizeIngredientName`
- `findOrCreate` (line 107): `toStartCase` → `normalizeIngredientName`
- `batchFindOrCreate` (line 270): `.map(toStartCase)` → `.map(normalizeIngredientName)`

### `workers/functions/lib/ai-utils.ts`
- `parseIngredientString` (line 249): replace inline regex with `extractPreparation`, return preparation alongside name

### `workers/functions/lib/routes/ai.ts`
- `ai.lookup` (line 31): normalize `input.ingredientName` before USDA/AI calls

## 4. Parsing changes

### `workers/functions/lib/ai-utils.ts` — `parseIngredientString`
Return type changes from `{ name, amount, unit }` to `{ name, amount, unit, preparation }`.

### `workers/functions/lib/constants.ts` — `parsedRecipeSchema`
Add `preparation: z.string().nullable()` to the ingredient object in the schema, so AI-parsed recipes can include it too.

## 5. Frontend changes

### `src/features/recipes/components/RecipeImportDialog.tsx`
- Pass `preparation` from parsed ingredients through to `addIngredient.mutateAsync`

### `src/features/recipes/components/IngredientSearchInput.tsx`
- In `parseSingleIngredient` and `parseIngredientList`: run `extractPreparation` on parsed names
- Pass `preparation` through to `addIngredient`

### `src/features/recipes/components/RecipeIngredientRow.tsx`
- Display preparation after ingredient name: `"Garlic Cloves"` + `"minced"` shown as muted text

---

## Files summary

| File | Change |
|------|--------|
| `workers/functions/lib/utils.ts` | Add `extractPreparation()`, `normalizeIngredientName()` |
| `packages/db/schema.ts` | Add `preparation` column to `recipeIngredients` |
| `workers/functions/lib/routes/recipes.ts` | Add `preparation` to schemas + handlers |
| `workers/functions/lib/routes/ingredients.ts` | Use `normalizeIngredientName` (3 places) |
| `workers/functions/lib/routes/ai.ts` | Normalize name before USDA/AI calls |
| `workers/functions/lib/ai-utils.ts` | Use `extractPreparation` in `parseIngredientString` |
| `workers/functions/lib/constants.ts` | Add `preparation` to `parsedRecipeSchema` |
| `src/features/recipes/components/RecipeImportDialog.tsx` | Pass preparation through |
| `src/features/recipes/components/IngredientSearchInput.tsx` | Extract + pass preparation |
| `src/features/recipes/components/RecipeIngredientRow.tsx` | Display preparation |

## Verification
1. `yarn db:generate && yarn db:migrate` — migration applies
2. `yarn build` — no type errors
3. Import a recipe with "Garlic Cloves, Minced" → ingredient created as "Garlic Cloves", preparation "minced" shown in recipe
4. Search "Finely Chopped Onion" → creates "Onion" ingredient, shows preparation
5. "Ground Beef" / "Crushed Tomatoes" / "Dried Apricots" → unchanged
