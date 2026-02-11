# Batch AI Lookups + Model Fallback

## Problem
Importing a recipe with 15 ingredients triggers up to 15 separate AI calls (one per `findOrCreate`). With Gemini free tier at 20 RPD, a single recipe exhausts the daily quota.

## Solution
Three changes gated by two per-user settings (both off by default):

1. **"Batch lookups" toggle** — batch N ingredient AI calls into 1 (fewer requests, may reduce accuracy)
2. **"Model fallback" toggle** — retry with cheaper models on 429 (lower quality, but doesn't fail)
3. New `ingredient.batchFindOrCreate` endpoint + `generateTextWithFallback` wrapper

---

## 1. Per-User Settings (two toggles)

**`packages/db/schema.ts`** — Add two columns to `userSettings`:
```typescript
batchLookups: integer('batch_lookups').notNull().default(0)    // 0=off, 1=on
modelFallback: integer('model_fallback').notNull().default(0)  // 0=off, 1=on
```

**`packages/db`** — Generate migration via `yarn db:generate`. Produces:
```sql
ALTER TABLE `user_settings` ADD `batch_lookups` integer NOT NULL DEFAULT 0;
ALTER TABLE `user_settings` ADD `model_fallback` integer NOT NULL DEFAULT 0;
```

**`workers/functions/lib/routes/settings.ts`**:
- `settings.get`: Return `batchLookups: boolean` and `modelFallback: boolean`
- `settings.save`: Accept optional `batchLookups: z.boolean()` and `modelFallback: z.boolean()`, persist as 0/1
- `getDecryptedApiKey`: Also return both booleans so call sites can branch

**`src/features/settings/SettingsPage.tsx`**:
- Add state for both toggles + sync from query
- Add two toggles below API key in an "API Usage" section:
  - "Batch ingredient lookups" — "Look up multiple ingredients in a single AI request. Uses fewer requests but may reduce accuracy."
  - "Model fallback" — "Automatically try cheaper models when rate-limited. Lower quality but won't fail on quota limits."
- Include both in save payload

## 2. Model Fallback (`generateTextWithFallback`)

**`workers/functions/lib/constants.ts`** — Add fallback chain:
```typescript
export const FALLBACK_MODELS: Record<AiProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite-preview', 'gemma-3-27b-it'],
  openai: [],
  anthropic: []
}
```
Gemma 3 27B has 14,400 RPD — effectively unlimited as a last resort.

**`workers/functions/lib/ai-utils.ts`** — Add wrapper + helper:
- `getModelByName(provider, apiKey, modelName)` — like `getModel` but accepts arbitrary model name
- `generateTextWithFallback({ provider, apiKey, output, prompt, fallback })` — wraps `generateText`. If `fallback` is true, catches `APICallError` with `statusCode === 429` and retries with next model in chain. If false, throws immediately.
- Import `APICallError` from `@ai-sdk/provider`

**Migrate all 5 existing `generateText` call sites** to `generateTextWithFallback`, passing `settings.modelFallback` as the `fallback` flag:
- `ingredients.ts:142` (USDA density/units enrichment)
- `ingredients.ts:220` (full AI fallback in findOrCreate)
- `ai.ts:53` (ai.lookup)
- `ai.ts:89` (ai.estimateCookedWeight)
- `ai.ts:163` (ai.parseRecipe)

## 3. Batch `ingredient.batchFindOrCreate`

**`workers/functions/lib/constants.ts`** — Add batch schema:
```typescript
export const batchIngredientAiSchema = z.array(z.object({
  name: z.string(),
  protein, carbs, fat, kcal, fiber, density, units // same fields as ingredientAiSchema
}))
```

**`workers/functions/lib/ai-utils.ts`** — Add `BATCH_INGREDIENT_AI_PROMPT` (same as `INGREDIENT_AI_PROMPT` but for multiple ingredients, "return in same order").

**`workers/functions/lib/routes/ingredients.ts`** — New endpoint:

Input: `{ names: string[] }` (max 50)
Returns: `Array<{ ingredient, source: 'existing' | 'usda' | 'ai' }>` in same order as input

Algorithm:
1. **DB lookup all** — single query with `IN` clause (case-insensitive)
2. **USDA lookup missing** — `Promise.all` (parallel, free API)
3. **Collect AI needs** — both "USDA found but needs density/units" and "not in USDA at all"
4. **Single AI call** for all collected ingredients using `batchIngredientAiSchema`
5. **Create all** in DB, return results in input order

For USDA-found ingredients: use USDA macros + AI density/units.
For AI-only ingredients: use AI macros + density/units.

## 4. Frontend Changes

**`src/features/recipes/components/RecipeImportDialog.tsx`**:
- Query `settings.get` to check `batchLookups`
- If ON: use `batchFindOrCreate` (single call for all ingredients)
- If OFF: keep existing sequential `findOrCreate` loop (current behavior)
- Update progress text accordingly

**`src/features/recipes/components/IngredientSearchInput.tsx`**:
- Query `settings.get` to check `batchLookups`
- If ON: use `batchFindOrCreate` for paste flow
- If OFF: keep existing sequential `findOrCreate` loop
- Keep existing `findOrCreate` for single-ingredient search (non-paste path, always individual)

---

## Implementation Order

1. `packages/db/schema.ts` — Add `batchLookups` + `modelFallback` columns + generate migration
2. `constants.ts` — `FALLBACK_MODELS` + `batchIngredientAiSchema`
3. `ai-utils.ts` — `getModelByName`, `generateTextWithFallback`, `BATCH_INGREDIENT_AI_PROMPT`
4. `settings.ts` (backend) — Update get/save/getDecryptedApiKey for new setting
5. `ingredients.ts` — `batchFindOrCreate` endpoint + migrate existing AI calls to fallback wrapper
6. `ai.ts` — Migrate 3 `generateText` calls to `generateTextWithFallback`
7. `SettingsPage.tsx` — Add toggle UI
8. `RecipeImportDialog.tsx` — Conditional batch vs sequential based on setting
9. `IngredientSearchInput.tsx` — Conditional batch vs sequential for paste
10. `CLAUDE.md` — Update API Structure + document new setting

## Verification

1. `yarn build` — type-check passes
2. Both OFF: import recipe — sequential individual calls, no fallback (current behavior)
3. Batch ON: import recipe with 10+ ingredients — single AI call for all
4. Fallback ON + exhausted quota: retries with next Gemini model
5. Both ON: batch call + fallback on 429
6. Paste flow respects batch setting
7. Single ingredient search always uses individual `findOrCreate`
8. All ingredients in DB — skips AI entirely regardless of settings
