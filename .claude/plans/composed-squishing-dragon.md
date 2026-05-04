# Cook Mode — Batch Scaling for Meal Preppers

## Context

Meal preppers cook 2x or 3x batches and need scaled ingredient amounts without manual math. Currently, viewing a recipe as the owner always shows edit mode — there's no clean, read-only cooking view. Cook mode is a dedicated page at `/recipes/:id/cook` with a batch multiplier, ingredient checklist, checkable method steps, and a macro summary.

No backend changes — all scaling is client-side state.

## Files to Create

### 1. `src/features/recipes/CookModePage.tsx`
Main page component. Fetches recipe via `trpc.recipe.get` (cache hit if navigated from editor). Uses `useRecipeCalculations` hook for base macros.

- Local state: `batchSize` (default 1)
- Computes `scaledIngredients` by mapping `recipeIngredients` and multiplying `amountGrams` + `displayAmount` by `batchSize`
- Computes `totalPortions = (cookedWeight / portionSize) * batchSize`
- Per-portion macros (`calculations.portion`) are NOT scaled — batch means more portions, not bigger ones
- Layout: `max-w-2xl mx-auto`, single column, stacked sections
- Sections: Header → BatchMultiplierPills + "Makes X portions" → CookIngredientList → CookInstructionSteps (if instructions exist) → CookPortionSummary

### 2. `src/features/recipes/components/BatchMultiplierPills.tsx`
Row of pill buttons: `[1×] [2×] [3×] [4×] [...]`

- Props: `value: number`, `onChange: (value: number) => void`
- Preset buttons (1-4): large `rounded-full` pills, accent bg when active
- Custom: clicking `...` shows a `NumberInput` (autoFocus, commits on blur); when a non-preset is active, the last pill shows `Nx` instead of `...`

### 3. `src/features/recipes/components/CookIngredientList.tsx`
Checklist of ingredients with checkboxes and scaled amounts.

- Props: `ingredients` (scaled `recipeIngredients` array)
- Local state: `checked: Set<string>` of `ri.id`s
- Each row is a full-width `<button>` (tap anywhere to toggle)
- Custom checkbox (styled div + inline SVG checkmark, accent colored when checked)
- Checked items: `line-through`, `opacity-50`, `bg-surface-2/50`
- Amount display: uses `formatIngredientAmount` from `utils/format.ts` — shows `"2½ tbsp (60g)"` for unit ingredients, `"600g"` for gram-only, `"2 portions"` for subrecipes
- Section header: "Ingredients"

### 4. `src/features/recipes/components/CookInstructionSteps.tsx`
Method steps parsed from markdown, each checkable.

- Props: `markdown: string`, `ingredients: RecipeIngredient[]` (scaled, for future highlighting)
- `parseSteps(markdown)`: splits lines, detects headings (→ non-checkable section dividers), ordered/unordered list items + paragraphs (→ checkable steps)
- Local state: `checked: Set<number>` of step indices
- Section header: "Method" with `checkedCount/stepCount` progress counter
- Same checkbox + button pattern as CookIngredientList
- Step text rendered as plain text (no ingredient highlighting initially — amounts are visible in the ingredient list above)

### 5. `src/features/recipes/components/CookPortionSummary.tsx`
Per-portion macro summary using existing MacroRing + MacroReadout + MacroBar.

- Props: `portion: AbsoluteMacros`
- Mirrors PortionPanel visuals (gradient bg, rounded border) but strips out CookedWeightInput / PortionSizeInput
- "Per Portion" header → MacroRing (lg, macro ratio) → 4× MacroReadout grid → MacroBar

## Files to Modify

### 6. `src/router.tsx`
Add route after `recipes/:id`:
```tsx
{ path: 'recipes/:id/cook', element: <CookModePage /> },
```

### 7. `src/features/recipes/RecipeEditorPage.tsx`
Add "Cook" `LinkButton` in the header for existing recipes with ingredients. Shown to both owners and viewers (cook mode is read-only). Place it in the right-side controls area, before owner-specific buttons.

### 8. `CLAUDE.md`
Update Routes section, Source Tree components list.

## Key Reusable Code

- `useRecipeCalculations` (`hooks/useRecipeCalculations.ts`) — base macro pipeline
- `getEffectiveCookedWeight`, `getEffectivePortionSize` (`utils/macros.ts`) — null-safe weight/portion fallbacks
- `formatIngredientAmount`, `formatAmount` (`utils/format.ts`) — nice fractions + unit formatting
- `MacroRing`, `MacroReadout`, `MacroBar` — macro visualization components
- `LinkButton` (`components/ui/Button.tsx`) — Link + Button variant
- `NumberInput` (`components/ui/NumberInput.tsx`) — for custom batch multiplier input

## Verification

1. `yarn typecheck` — no type errors
2. `yarn dev` — navigate to a recipe with ingredients, click "Cook" button, verify:
   - Batch pills work (1-4x presets + custom)
   - Ingredient amounts scale correctly
   - "Makes X portions" updates with multiplier
   - Checkboxes toggle with visual feedback (strikethrough + dimming)
   - Method steps parse and check off correctly
   - Per-portion macros stay constant regardless of batch size
   - Subrecipe ingredients display as scaled portions
   - Back button returns to recipe editor
3. Test edge cases: recipe with no instructions, recipe with no cooked weight / portion size, premade recipe
