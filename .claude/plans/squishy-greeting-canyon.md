# Linked Portion Size / Portion Count Inputs

## Context

Currently `PortionSizeInput` is a single grams input, and the portion count below it (`= 2.0 portions`) is read-only text. The user wants to edit **either** grams or count, with the other updating automatically.

The math relationship (already used for the read-only display):
- `portionCount = effectiveCookedWeight / portionSize`
- `portionSize = effectiveCookedWeight / portionCount`

Only `portionSize` (grams) is stored in the DB — count is always derived.

## Plan

### 1. Modify `PortionSizeInput` to accept `effectiveCookedWeight`

**File:** `src/features/recipes/components/PortionSizeInput.tsx`

Add `effectiveCookedWeight: number` to props. Render two `NumberInput`s side by side:

```
Portion size
[ 250 ] g   ×   [ 2.0 ]
```

- **Left input**: grams (current behavior, unchanged)
- **`×` separator**: visual link between the two
- **Right input**: portion count (new, derived from `effectiveCookedWeight / portionSize`)

Behavior:
- Editing grams → calls `onChange(grams)` as today, count re-derives
- Editing count → computes `effectiveCookedWeight / count`, calls `onChange(result)`
- When `portionSize` is null: grams placeholder "Whole", count shows "1"
- Clearing either field → `onChange(null)` (reset to whole dish = 1 portion)
- Both inputs read-only when `onChange` is undefined

State: Two local `useState` strings (one per input). On blur of either, validate → compute the other → call `onChange`. The `useEffect` syncing from prop already exists for grams; extend it to also sync the count string.

### 2. Remove the read-only "= X.X portions" display from `PortionPanel`

**File:** `src/features/recipes/components/PortionPanel.tsx`

- Remove the `portions` calculation (lines 34-35)
- Remove the `<div className="text-center ...">= X.X portions</div>` (lines 70-73)
- Pass `effectiveCookedWeight` to `PortionSizeInput`

### 3. Update PortionPanel props threading

No new props needed — `effectiveCookedWeight` is already available in `PortionPanel`.

## Files to modify

1. `src/features/recipes/components/PortionSizeInput.tsx` — add second input + linking logic
2. `src/features/recipes/components/PortionPanel.tsx` — pass `effectiveCookedWeight`, remove read-only portions display

## Verification

- `yarn typecheck` passes
- Dev: set cooked weight to 500g, type 100 in grams → count shows 5.0
- Dev: type 4 in count → grams shows 125
- Dev: clear grams → both reset, portion = whole dish
- Dev: read-only mode (viewing someone else's recipe) — both inputs disabled
