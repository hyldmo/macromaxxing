# Recipe Importer

## Context

Users want to import recipes from cooking websites or pasted text instead of manually entering every ingredient. The app already has AI integration (multi-provider BYOK) and a batch ingredient paste flow. This feature adds a structured import pipeline that:
1. Extracts recipe data from URLs (JSON-LD first, AI fallback) or raw text (AI)
2. Creates the recipe with all ingredients resolved via the existing `findOrCreate` flow
3. Tracks the source URL to warn users about publishing imported recipes

## Changes

### 1. DB: Add `sourceUrl` column to recipes

**File:** `packages/db/schema.ts`
- Add `sourceUrl: text('source_url')` to the `recipes` table (nullable, null = manual/text)

**Migration:** `yarn db:generate` to create migration, `yarn db:migrate` to apply

### 2. Backend: Parsing utilities in `ai-utils.ts`

**File:** `workers/functions/lib/ai-utils.ts`

Add three exported functions:

- **`extractJsonLdRecipe(html: string)`** — Finds `<script type="application/ld+json">` blocks, traverses for `@type: "Recipe"` (handles `@graph` arrays), extracts `name`, `recipeIngredient[]`, `recipeInstructions` (normalizes HowToStep/string/array), `recipeYield` (parses to number)

- **`parseIngredientString(text: string)`** — Regex-based parser (same patterns as frontend's `parseSingleIngredient` in `IngredientSearchInput.tsx` but with fraction support `1/2`, imperial units `oz`/`lb`/`kg`, and bullet stripping). Returns `{ name, amount, unit }` or null

- **`stripHtml(html: string)`** — Strips `<script>`, `<style>`, HTML tags, collapses whitespace. Used to prepare page text for AI when no JSON-LD found

### 3. Backend: Zod schema in `constants.ts`

**File:** `workers/functions/lib/constants.ts`

Add `parsedRecipeSchema`:
```ts
z.object({
  name: z.string(),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    unit: z.string()
  })),
  instructions: z.string(),
  servings: z.number().nullable()
})
```

### 4. Backend: `ai.parseRecipe` endpoint

**File:** `workers/functions/lib/routes/ai.ts`

New `protectedProcedure` mutation. Input: `{ url?: string, text?: string }` (at least one required).

Flow:
1. **URL provided** → `fetch(url)` server-side → try `extractJsonLdRecipe(html)`
2. **JSON-LD found** → parse ingredient strings with `parseIngredientString()` → return with `source: 'structured'` (no AI needed, no API key needed)
3. **No JSON-LD / text input** → require AI config → `stripHtml()` if HTML, truncate to 8000 chars → `generateText()` with `parsedRecipeSchema` → return with `source: 'ai'`

Return type: `{ name, ingredients[], instructions, servings, source: 'structured' | 'ai' }`

### 5. Backend: Pass `sourceUrl` through recipe creation

**File:** `workers/functions/lib/routes/recipes.ts`

- Add `sourceUrl: z.string().url().nullable().optional()` to `insertRecipeSchema`
- Include `sourceUrl` in the `insert().values()` call in `recipe.create`

### 6. Frontend: `RecipeImportDialog` component

**New file:** `src/features/recipes/components/RecipeImportDialog.tsx`

Portal-rendered overlay dialog with three steps:

**Input step:**
- Tab toggle: URL / Text
- URL input or textarea
- "Parse" button → calls `trpc.ai.parseRecipe`

**Preview step:**
- Editable recipe name
- Ingredient list with parsed amounts/units
- Instructions preview (truncated)
- Servings count
- Source badge (structured / AI)

**Import step:**
- Creates recipe via `trpc.recipe.create` (passing `sourceUrl` if URL mode)
- Sequentially `findOrCreate` + `addIngredient` for each ingredient (reuses exact pattern from `IngredientSearchInput.tsx`'s batch flow)
- Shows progress: "Adding ingredients... (3/8)"
- On complete: navigates to `/recipes/{id}`

### 7. Frontend: "Import" button on recipe list

**File:** `src/features/recipes/RecipeListPage.tsx`

- Add outline "Import" button next to "New Recipe"
- Renders `<RecipeImportDialog>`

### 8. Frontend: Publish warning for URL-imported recipes

**File:** `src/features/recipes/RecipeEditorPage.tsx`

- When toggling public ON and `recipeQuery.data.sourceUrl` is set:
  - Show confirmation dialog: "This recipe was imported from {url}. Make sure you have permission to share it publicly."
  - Two buttons: "Cancel" / "Publish anyway"
  - Only fires the `updateMutation` if user confirms
- When `sourceUrl` is null: toggle works as before (immediate)

## File Summary

| File | Action |
|------|--------|
| `packages/db/schema.ts` | Add `sourceUrl` column |
| `workers/functions/lib/constants.ts` | Add `parsedRecipeSchema` |
| `workers/functions/lib/ai-utils.ts` | Add `extractJsonLdRecipe`, `parseIngredientString`, `stripHtml` |
| `workers/functions/lib/routes/ai.ts` | Add `parseRecipe` endpoint |
| `workers/functions/lib/routes/recipes.ts` | Add `sourceUrl` to create schema |
| `src/features/recipes/components/RecipeImportDialog.tsx` | New dialog component |
| `src/features/recipes/RecipeListPage.tsx` | Add Import button + dialog |
| `src/features/recipes/RecipeEditorPage.tsx` | Add publish warning for imported recipes |
| `CLAUDE.md` | Update API Structure with `trpc.ai.parseRecipe` |

## Verification

1. `yarn db:generate && yarn db:migrate` — migration applies cleanly
2. `yarn dev` — start local dev
3. Import from URL (e.g., an AllRecipes page) — should use JSON-LD path, no AI key needed
4. Import from text paste — should use AI path, requires configured API key
5. Verify imported recipe has all ingredients with correct amounts
6. Toggle imported recipe to public — warning dialog appears
7. Toggle manually-created recipe to public — no warning
8. `yarn workspaces foreach --all --parallel run typecheck` — no type errors
9. `yarn fix` — passes lint
