# Plan: Normalize Ingredient Names to Start Case

## Recommendation: Normalize at the Backend

**Why backend over UI:**
- Single point of normalization catches all entry points (user input, USDA API, AI responses)
- Consistent data regardless of source
- Complements the existing case-insensitive lookup in `findOrCreate`
- Avoids duplicating logic across multiple UI components

## Changes

### 1. Add a `toStartCase` utility function

**File:** `workers/functions/lib/utils.ts` (new file, or add to existing if one exists)

```ts
export const toStartCase = (str: string): string =>
  str.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
```

This handles:
- "chicken breast" → "Chicken Breast"
- "OLIVE OIL" → "Olive Oil"
- "  pasta  " → "Pasta"

### 2. Apply normalization in ingredient routes

**File:** `workers/functions/lib/routes/ingredients.ts`

Apply `toStartCase()` to ingredient names in:

1. **`ingredient.create`** (~line 144) - normalize `input.name` before insert
2. **`ingredient.findOrCreate`** (~line 169) - normalize `input.name` at the start of the procedure

This ensures all new ingredients get consistent casing.

### 3. Optional: Migration to fix existing data

If you have existing ingredients with inconsistent casing, a one-time migration could normalize them. This is optional and can be done later.

## Files to Modify

| File | Change |
|------|--------|
| `workers/functions/lib/routes/ingredients.ts` | Import and apply `toStartCase` to names |
| `workers/functions/lib/utils.ts` | Create file with `toStartCase` function |

## Verification

1. Run `yarn dev`
2. Add an ingredient with lowercase name like "chicken breast"
3. Verify it's stored as "Chicken Breast" in the database
4. Add via paste feature with mixed case
5. Verify normalization works consistently
