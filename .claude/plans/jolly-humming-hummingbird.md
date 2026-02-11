# Plan: Add sparkle button to enrich ingredients + consolidate AI utils

## Summary
Add a sparkle button to the ingredient edit form that auto-fills units and density from AI. Use density to auto-calculate volume units instead of having AI generate them. Consolidate duplicate backend code.

## Changes

### 1. Extract shared utilities to new file
**Create:** `workers/functions/lib/ai-utils.ts`

Move from `ai.ts` and `ingredients.ts`:
- `getModel()` function
- `lookupUSDA()` function
- `INGREDIENT_AI_PROMPT` constant (currently duplicated in both files)
- Related types (`Macros`)

Add new utility:
- `calculateVolumeUnits(density: number)` - returns standard volume units calculated from density:
  - tbsp = 15ml × density
  - tsp = 5ml × density
  - cup = 240ml × density
  - dl = 100ml × density
  - ml = 1 × density

### 2. Update AI prompts and schemas
**Modify:** `workers/functions/lib/constants.ts`
- Remove `enrichIngredientSchema` I added

**Move prompt to shared location:** `workers/functions/lib/ai-utils.ts`
- Move `INGREDIENT_AI_PROMPT` here (currently duplicated in both ai.ts and ingredients.ts)
- Remove duplicate prompts from route files
- Remove `ENRICH_INGREDIENT_PROMPT` I added to ingredients.ts

**Update the shared prompt:**

Change from:
```
- For liquids/powders: include tbsp, tsp, cup, dl
- For whole items (eggs, fruits, vegetables): include pcs, small, medium, large
```

To:
```
- For whole items (eggs, fruits, vegetables): include pcs, small, medium, large
- For supplements/protein powders: include scoop
- Do NOT include volume units (tbsp, tsp, cup, dl, ml) - these are calculated from density
- Always include "g" as a unit with grams=1
```

AI returns:
- `density` (g/ml) for liquids/powders, null for solids
- `units` array with item-specific units only (pcs, scoop, medium, etc.) + "g"
- Volume units (tbsp, tsp, cup, dl, ml) are **NOT** requested from AI - calculated from density

### 3. Update backend routes to use shared utils
**Modify:** `workers/functions/lib/routes/ai.ts`
- Import from `../ai-utils`
- Remove duplicated code
- Add optional `unitsOnly?: boolean` input parameter
  - When `true`: skip USDA, only call AI, only return density + units (for enrichment)
  - When `false`/undefined: current behavior (USDA → AI fallback for macros)
- When returning result: merge AI units + calculated volume units (if density exists)
- This way frontend just loops through returned units without calculating

**Modify:** `workers/functions/lib/routes/ingredients.ts`
- Import from `../ai-utils`
- Remove duplicated code
- Remove `enrich` endpoint
- In `findOrCreate`, when inserting units: if density, also insert calculated volume units

### 4. Update frontend
**Modify:** `src/features/ingredients/components/IngredientForm.tsx`

Sparkle button already exists (added earlier). Update to use `ai.lookup` instead of `enrich`:
- Remove `enrichMutation`
- Add `lookupMutation` using `trpc.ai.lookup`

The sparkle button will:
1. Call `trpc.ai.lookup.mutate({ ingredientName, unitsOnly: true })` - forces AI, skips USDA
2. If `density` returned → update density state + call `ingredient.update` to save it
3. For each unit in response (already includes calculated volume units) → call `createUnit` if not exists
4. Show loading state while processing

## Files to modify
- `workers/functions/lib/ai-utils.ts` (new)
- `workers/functions/lib/constants.ts`
- `workers/functions/lib/routes/ai.ts`
- `workers/functions/lib/routes/ingredients.ts`
- `src/features/ingredients/components/IngredientForm.tsx`

## Volume unit constants
```ts
const VOLUME_UNITS = [
  { name: 'ml', ml: 1 },
  { name: 'tsp', ml: 5 },
  { name: 'tbsp', ml: 15 },
  { name: 'dl', ml: 100 },
  { name: 'cup', ml: 240 },
]
```

## Verification
1. Run `yarn dev`
2. Go to Ingredients page
3. Edit an ingredient (e.g., "Olive Oil") that has no units
4. Click sparkle "Auto-fill" button
5. Verify:
   - Density is filled (e.g., 0.92 for olive oil)
   - Volume units are auto-calculated (tbsp ≈ 13.8g, cup ≈ 220.8g)
   - No duplicate units created
6. Test with a solid ingredient (e.g., "Eggs") - should get pcs unit, no volume units
7. Run `yarn build` to check for type errors
