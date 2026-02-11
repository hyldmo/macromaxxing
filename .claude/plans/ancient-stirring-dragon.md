# Wire up product URL parsing in PremadeDialog

## Goal
Paste a product URL → auto-fill name, serving size, servings, and macros from the page.

## 1. `parsedProductSchema` — `workers/functions/lib/constants.ts`

New schema for AI output:
```ts
export const parsedProductSchema = z.object({
  name: z.string(),
  servingSize: z.number().describe('Serving size in grams'),
  servings: z.number().nullable().describe('Servings per container, null if unknown'),
  protein: z.number().describe('Protein per serving in grams'),
  carbs: z.number().describe('Carbs per serving in grams'),
  fat: z.number().describe('Fat per serving in grams'),
  kcal: z.number().describe('Calories per serving'),
  fiber: z.number().describe('Fiber per serving in grams'),
})
```

## 2. JSON-LD product extractor — `workers/functions/lib/ai-utils.ts`

New `extractJsonLdProduct()` — same pattern as existing `extractJsonLdRecipe()`:
- Scan `<script type="application/ld+json">` tags (reuse existing regex)
- Find `@type: "Product"` with `nutrition` field (`NutritionInformation`)
- Parse string values like `"21 g"`, `"240 calories"` → extract number
- Return `{ name, servingSize, servings, protein, carbs, fat, kcal, fiber }` or null

## 3. `ai.parseProduct` endpoint — `workers/functions/lib/routes/ai.ts`

`protectedProcedure`, input: `{ url: z.string().url() }`

1. Fetch URL (same User-Agent as `parseRecipe`)
2. Try `extractJsonLdProduct(html)` → return with `source: 'structured'`
3. AI fallback: `stripHtml(html).slice(0, 8000)` + prompt with `parsedProductSchema`
4. Return `{ ...data, source }`

## 4. Update `PremadeDialog` — `src/features/recipes/components/PremadeDialog.tsx`

- Add `parseProduct` mutation
- "Fetch" button next to URL input (shows spinner while loading)
- On success: auto-fill all fields from response
- User can still edit before submitting
- Manual entry still works without a URL

## Files
- `workers/functions/lib/constants.ts`
- `workers/functions/lib/ai-utils.ts`
- `workers/functions/lib/routes/ai.ts`
- `src/features/recipes/components/PremadeDialog.tsx`
- `CLAUDE.md`

## Verification
`yarn fix && yarn workspaces foreach --all --parallel run typecheck`
