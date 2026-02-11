# Subrecipes Support

## Context

Recipes like pizza dough, sauces, or marinades are often components of larger recipes. Currently there's no way to reference one recipe inside another. Subrecipes let you add a recipe as a "component" of another recipe, with its aggregated macros flowing into the parent. This avoids duplicating ingredients and keeps nutrition data in sync.

## Data Model

### Schema change: `recipeIngredients` (`packages/db/schema.ts`)

- Add `subrecipeId` column: `typeidCol('rcp')('subrecipe_id').references(() => recipes.id)` (nullable)
- Change `ingredientId` from `.notNull()` to nullable (exactly one of `ingredientId` or `subrecipeId` must be set per row)
- Existing fields `amountGrams`, `displayUnit`, `displayAmount`, `sortOrder` stay as-is
  - For subrecipe rows: `displayUnit = 'portions'`, `displayAmount = N`, `amountGrams = N * subrecipe's effective portion size`
  - `preparation` unused for subrecipe rows

### Relations update (`packages/db/relations.ts`)

- `recipeIngredientsRelations`: add `subrecipe: one(recipes, { ..., relationName: 'subrecipe' })`
- `recipesRelations`: disambiguate existing `recipeIngredients` with `relationName: 'parentRecipe'`, add `usedAsSubrecipeIn: many(recipeIngredients, { relationName: 'subrecipe' })`

### Migration

- `yarn db:generate` to produce the migration for the new column + nullable change

## API Changes (`workers/functions/lib/routes/recipes.ts`)

### `recipe.get` / `recipe.list` query update

Include subrecipe data in the `with` clause:
```
recipeIngredients: {
  with: {
    ingredient: { with: { units: true } },
    subrecipe: {
      with: { recipeIngredients: { with: { ingredient: true } } }
    }
  }
}
```

This loads one level of subrecipe ingredients (enough for the expanded view).

### New endpoint: `recipe.addSubrecipe`

- Input: `{ recipeId: TypeID<'rcp'>, subrecipeId: TypeID<'rcp'>, portions?: number }` (default 1)
- **Cycle detection**: recursive walk - load `subrecipeId`'s own recipeIngredients where `subrecipeId IS NOT NULL`, check if `recipeId` appears anywhere in the chain. Throw `BAD_REQUEST` if cycle detected.
- Calculate `amountGrams`: load subrecipe, compute `effectivePortionSize = portionSize ?? cookedWeight ?? rawTotal`, then `amountGrams = portions * effectivePortionSize`
- Insert with `displayUnit: 'portions'`, `displayAmount: portions`, `ingredientId: null`
- Touch parent recipe's `updatedAt`

### `recipe.updateIngredient`

No changes needed - `amountGrams`, `displayUnit`, `displayAmount` updates work for both types.

### `recipe.removeIngredient`

No changes needed - works on `recipeIngredients.id` regardless of type.

## Frontend - Calculations

### New utility: `calculateSubrecipePer100g` (`src/features/recipes/utils/macros.ts`)

```ts
export function calculateSubrecipePer100g(subrecipe: {
  recipeIngredients: IngredientWithAmount[]
  cookedWeight: number | null
}): MacrosPer100g
```

Computes totals from subrecipe's ingredients, divides by effective cooked weight, multiplies by 100. Returns per-100g macros that can be fed into `calculateIngredientMacros`.

### `useRecipeCalculations` update (`src/features/recipes/hooks/useRecipeCalculations.ts`)

For each `recipeIngredient`:
- If `ri.subrecipe` exists: use `calculateSubrecipePer100g(ri.subrecipe)` as the per100g source
- Otherwise: use `ri.ingredient` as before (with `!` assertion since one must be set)

## Frontend - Ingredient Search

### `IngredientSearchInput.tsx` changes

- Add `trpc.recipe.list.useQuery()` to fetch recipes
- Filter out the current recipe (can't add self) and premade type
- Show a **"Your Recipes"** section below ingredient results in the dropdown, separated by a border
- Recipe items show: recipe icon + name + portion info (e.g., "4 portions") + mini macro summary
- On select: call `trpc.recipe.addSubrecipe.useMutation()` with `{ recipeId, subrecipeId }`

## Frontend - Table Display

### `RecipeIngredientRow.tsx` changes

Detect subrecipe rows via `ri.subrecipe != null`:

**Subrecipe row differences:**
- Left side: expand/collapse chevron (ChevronRight/ChevronDown) instead of grip handle + recipe name as a `<Link>` to `/recipes/{subrecipeId}`
- Amount display: show portions (e.g., "2 portions") with grams in parentheses, editable via NumberInput
- When portions change: recalculate `amountGrams = newPortions * subrecipe.effectivePortionSize`, update via `updateIngredient`
- No preparation input
- Same macro cells (protein, carbs, fat, kcal) using the derived per100g values
- Same MacroBar underneath
- Still sortable (drag-and-drop works as before)

### New: `SubrecipeExpandedRows` component

Rendered when a subrecipe row is expanded. Shows the subrecipe's ingredients inline:

- Indented (extra `pl-8` on the name cell)
- Muted text (`text-ink-muted`) to distinguish from top-level ingredients
- Amounts **scaled** to the portion fraction being used: `scaleFactor = parentAmountGrams / subrecipeCookedWeight`
- Read-only (no editing, no drag handles)
- No MacroBar per child row (keeps it compact)
- Clicking an ingredient name does nothing (or could link to ingredient in future)

Visual structure:
```
[v] [link] Pizza Dough        2 portions (240g)  P  C  F  Kcal
     ├─ Flour                 125g               ...
     ├─ Water                 75g                ...
     ├─ Yeast                 2g                 ...
     └─ Salt                  3g                 ...
[=] Mozzarella                200g               P  C  F  Kcal
[=] Tomato Sauce              150g               P  C  F  Kcal
```

### `RecipeIngredientTable.tsx` changes

- Pass expand state down (local state: `Set<string>` of expanded recipeIngredient IDs)
- After each subrecipe `RecipeIngredientRow`, conditionally render `SubrecipeExpandedRows`
- Expanded rows are `<tr>` elements inside the same `<tbody>` but not part of the sortable items

## Files to Modify

1. `packages/db/schema.ts` - add `subrecipeId`, make `ingredientId` nullable
2. `packages/db/relations.ts` - add subrecipe relation with `relationName`
3. `packages/db/types.ts` - no changes needed (inferred types auto-update)
4. `workers/functions/lib/routes/recipes.ts` - update queries, add `addSubrecipe` endpoint
5. `src/features/recipes/utils/macros.ts` - add `calculateSubrecipePer100g`
6. `src/features/recipes/hooks/useRecipeCalculations.ts` - handle subrecipe rows
7. `src/features/recipes/components/IngredientSearchInput.tsx` - add recipe search section
8. `src/features/recipes/components/RecipeIngredientRow.tsx` - subrecipe row variant
9. `src/features/recipes/components/RecipeIngredientTable.tsx` - expand state, render expanded rows
10. `src/features/recipes/components/SubrecipeExpandedRows.tsx` - **new file** for expanded inline view

## Verification

1. `yarn db:generate` - confirm migration generates cleanly
2. `yarn db:migrate` - apply to local D1
3. `yarn typecheck` - confirm no type errors across the monorepo
4. `yarn dev` - test end-to-end:
   - Create recipe A with ingredients
   - Create recipe B, search for recipe A in ingredient search
   - Add recipe A as subrecipe with 1 portion - verify macros match
   - Change to 2 portions - verify macros scale correctly
   - Expand subrecipe row - verify child ingredients shown with scaled amounts
   - Click subrecipe name - navigates to recipe A
   - Try adding recipe B to recipe A (cycle) - verify error
   - Verify totals bar includes subrecipe macros
   - Verify portion panel reflects correct per-portion values
