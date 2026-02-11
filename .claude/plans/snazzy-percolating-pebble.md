# Macromaxxing UX Overhaul

## The Problem

The app is functionally complete but visually generic. Every page follows the same pattern: title, card, table/form. The macro data -- the entire point of the app -- is crammed into tiny monospace table cells. There's no visual hierarchy, no focal point, no data visualization. It looks like a CRUD template with a dark skin.

## Domain Exploration

**Who uses this:** Fitness enthusiasts who meal prep. They care about one question above all: "how much protein per serving?" The name "macromaxxing" is gym culture -- optimization, gains, precision.

**Domain concepts:** Kitchen scales (digital readouts), nutrition labels (FDA format), mixing boards (multiple channels, levels), meal prep containers (portions), progressive overload tracking.

**Color world:** The existing macro colors are good (copper protein, golden carbs, olive fat, warm orange kcal, sage fiber). Keep them. The problem isn't color -- it's that color is only used for tiny text labels, not for anything structural.

**Signature element:** The **MacroRing** -- an SVG donut chart showing the P/C/F caloric ratio. It gives every recipe a visual fingerprint. You can glance at a recipe card and instantly see "high protein" vs "carb-heavy" from the ring segment distribution.

**Defaults being rejected:**
- Generic card grid -> Recipe cards with macro rings and stacked bars
- Data buried in table footer -> Sticky PortionPanel as dedicated right column
- Flat number display -> MacroReadout components with scale-display aesthetic

---

## What Changes

### 1. New Visualization Components (pure CSS/SVG, no libraries)

**`MacroRing.tsx`** -- SVG donut chart showing P/C/F caloric ratio
- Three `<circle>` elements with `stroke-dasharray`/`stroke-dashoffset`
- Center shows kcal number
- Caloric ratio: protein*4, carbs*4, fat*9
- Sizes: `sm` (48px, list cards), `md` (80px), `lg` (120px, editor panel)

**`MacroBar.tsx`** -- Thin horizontal stacked bar
- Flex div with three colored segments (protein/carbs/fat)
- Width proportional to caloric contribution
- Height: 6px, rounded-full
- Used in: recipe cards, ingredient rows, totals bar

**`MacroReadout.tsx`** -- Digital scale display for a single macro
- Label (uppercase, xs, muted) -> Value (mono, 2xl, bold, colored) -> Unit (xs, faint)
- Used in the PortionPanel for per-portion values

**`macros.ts`** -- Add `caloricRatio()` helper:
```ts
export function caloricRatio(protein: number, carbs: number, fat: number) {
  const pCal = protein * 4, cCal = carbs * 4, fCal = fat * 9
  const total = pCal + cCal + fCal
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 }
  return { protein: pCal / total, carbs: cCal / total, fat: fCal / total }
}
```

### 2. Recipe Editor -- Two-Column Layout

The biggest structural change. Currently a single card with everything stacked vertically.

**New layout:**
```
Desktop (lg+):
+---------------------------------------------------------------+
| <- Back    Recipe Name (large, inline-editable)                |
+---------------------------------------------------------------+
| LEFT COLUMN (flex-1)              | RIGHT COLUMN (340px)       |
|                                   |                            |
| [Search/add ingredient...]        | PER PORTION (sticky)       |
|                                   |                            |
| +--Ingredient List-------------+  |   [MacroRing lg]           |
| | Pasta        500g        [x] |  |    268 kcal                |
| |  [=======macro bar=======]   |  |                            |
| | Chicken      300g        [x] |  |   P: 82g    C: 180g       |
| |  [=======macro bar=======]   |  |   F: 10g    Fiber: 7g     |
| +------------------------------+  |                            |
|                                   |   ---                      |
| +--Totals Bar------------------+  |   Cooked wt: [650] g      |
| | 800g raw  163P  360C  19F   |  |   Portion:   [325] g      |
| | [=========macro bar========] |  |   = 2.0 portions          |
| +------------------------------+  |                            |
+---------------------------------------------------------------+

Mobile (<lg):
+----------------------------------+
| <- Back    Recipe Name           |
+----------------------------------+
| PER PORTION (order-first on mob) |
| [MacroRing sm]  268kcal          |
| P: 82g  C: 180g  F: 10g         |
| Cooked: [650]g  Portion: [325]g |
+----------------------------------+
| [Search/add ingredient...]       |
+----------------------------------+
| Pasta         500g          [x]  |
| [=======macro bar========]      |
| Chicken       300g          [x]  |
| [=======macro bar========]      |
+----------------------------------+
| TOTAL: 800g  163P  360C  19F    |
+----------------------------------+
```

**Key decisions:**
- `grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4`
- PortionPanel uses `lg:sticky lg:top-4` so it stays visible while scrolling ingredients
- On mobile, PortionPanel uses `order-first lg:order-last` to appear at top
- Recipe name moves to page header (not inside a card)
- The Card wrapper is removed -- the page itself is the structure

**New component: `PortionPanel.tsx`**
- Contains: MacroRing (lg), 4x MacroReadout in 2x2 grid, divider, CookedWeightInput, PortionSizeInput, computed portions count
- Subtle gradient background to distinguish from flat cards
- Border + rounded corners

**New component: `RecipeTotalsBar.tsx`**
- Replaces the tfoot summary rows
- Horizontal bar below ingredient list: total weight + P/C/F values + MacroBar
- `bg-surface-2/60` background

**Changes to `RecipeIngredientTable.tsx`:**
- Remove tfoot entirely (totals move to RecipeTotalsBar, portion moves to PortionPanel)
- Add a MacroBar row below each ingredient row (colSpan, no border)
- Simplify columns: remove fiber column from table (fiber shown only in PortionPanel)
- Table becomes: Item | Amount | Protein | Carbs | Fat | Kcal | [x]

**Changes to `RecipeEditorPage.tsx`:**
- Remove Card/CardHeader/CardContent wrapper
- Implement two-column grid layout
- Recipe name as standalone heading input
- Left column: IngredientSearchInput + RecipeIngredientTable + RecipeTotalsBar
- Right column: PortionPanel

### 3. Recipe List -- Cards with Visual Macro Profile

Currently every card is text-only and looks identical. New cards show a MacroRing + MacroBar.

**New component: `RecipeCard.tsx`** (extracted from RecipeListPage)
```
+------------------------------------------------------------+
| [MacroRing sm]  Chicken Pasta              268 kcal        |
|                 3 items / 325g portion                     |
|                 P: 82g  C: 180g  F: 10g                   |
|                 [=========macro bar=========]              |
+------------------------------------------------------------+
```

- `flex items-center gap-4` layout
- MacroRing (48px) on left gives each recipe visual identity
- Kcal number large (text-lg, bold, macro-kcal color) on right
- MacroBar at bottom of text section
- Hover: `bg-surface-2` transition

### 4. Navigation -- Mobile Bottom Tabs

Currently: top nav bar only. Problem: on mobile, 3 top links are tiny and feel like an afterthought.

**Changes to `Nav.tsx`:**
- Desktop (md+): Keep existing top bar, mostly unchanged
- Mobile (<md): Add fixed bottom tab bar with icons + labels
- Each tab: icon (h-5 w-5) + label (text-xs) stacked vertically
- Active state: accent color; inactive: ink-muted

**Changes to `RootLayout.tsx`:**
- Increase container to `max-w-5xl` (editor needs more room for 2 columns)
- Add `pb-16 md:pb-0` to main content to clear mobile bottom nav

### 5. Ingredient List -- MacroBar Per Row + Mobile Cards

**Desktop table changes:**
- Add MacroBar after each row's macro values (or as a sub-row)
- Keep existing table structure otherwise

**Mobile (<md):**
- Hide table, show card layout instead
- Each ingredient as a card: name, colored macro values, MacroBar, source badge, edit/delete

### 6. Ingredient Search Dropdown -- Visual Enhancement

**Changes to `IngredientSearchInput.tsx`:**
- Add `Search` icon prefix inside the input
- Each dropdown item gets a small MacroBar showing the ingredient's P/C/F ratio
- AI lookup button: more prominent styling, full-width with Sparkles icon

### 7. Cooked Weight + Portion Inputs -- Vertical Layout with Context

**Changes to `CookedWeightInput.tsx`:**
- Vertical layout: label above input (not inline)
- Show moisture loss context: `800g raw -> 650g (-19%)`

**Changes to `PortionSizeInput.tsx`:**
- Vertical layout: label above input
- No other functional changes (portions count shown in PortionPanel parent)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/features/recipes/components/MacroRing.tsx` | SVG donut chart (P/C/F caloric ratio) |
| `src/features/recipes/components/MacroBar.tsx` | CSS horizontal stacked bar |
| `src/features/recipes/components/MacroReadout.tsx` | Scale-display single macro value |
| `src/features/recipes/components/PortionPanel.tsx` | Right column sticky panel with ring + readouts + controls |
| `src/features/recipes/components/RecipeTotalsBar.tsx` | Horizontal totals summary bar |
| `src/features/recipes/components/RecipeCard.tsx` | Recipe list card with MacroRing |

## Files to Modify

| File | Changes |
|------|---------|
| `src/features/recipes/utils/macros.ts` | Add `caloricRatio()` helper |
| `src/features/recipes/RecipeEditorPage.tsx` | Two-column layout, remove Card wrapper |
| `src/features/recipes/RecipeListPage.tsx` | Use RecipeCard, remove inline calculation logic |
| `src/features/recipes/components/RecipeIngredientTable.tsx` | Remove tfoot, add MacroBar per row, drop fiber column |
| `src/features/recipes/components/RecipeIngredientRow.tsx` | Add MacroBar sub-row |
| `src/features/recipes/components/CookedWeightInput.tsx` | Vertical layout, moisture loss display |
| `src/features/recipes/components/PortionSizeInput.tsx` | Vertical layout |
| `src/features/recipes/components/IngredientSearchInput.tsx` | Search icon, MacroBar in results |
| `src/components/layout/Nav.tsx` | Add mobile bottom tab bar |
| `src/components/layout/RootLayout.tsx` | Wider container, mobile bottom padding |
| `src/features/ingredients/IngredientListPage.tsx` | MacroBar per row, mobile card layout |
| `src/index.css` | Add tabular-nums utility, transition timing token |

## Files Unchanged

- All backend files (`functions/**`)
- `src/components/ui/Button.tsx`, `Input.tsx`, `Card.tsx`, `Spinner.tsx`
- `src/features/settings/SettingsPage.tsx`
- `src/features/recipes/components/MacroCell.tsx` (still used in table)
- `src/features/recipes/hooks/useRecipeCalculations.ts`

## Implementation Order

1. **Foundation:** `caloricRatio()` in macros.ts, then MacroBar, MacroRing, MacroReadout (standalone, no breakage)
2. **Recipe Editor:** PortionPanel, RecipeTotalsBar, then refactor RecipeEditorPage to two-column layout, update RecipeIngredientTable
3. **Recipe List:** RecipeCard, refactor RecipeListPage
4. **Navigation:** Nav.tsx mobile bottom tabs, RootLayout width/padding
5. **Ingredients:** MacroBar in rows, mobile card layout
6. **Polish:** IngredientSearchInput dropdown, CookedWeight/PortionSize vertical layout, transitions

## Verification

1. `yarn build` passes
2. `yarn fix` -- no lint errors
3. Desktop: Recipe editor shows two-column layout with sticky PortionPanel
4. Desktop: Recipe list cards show MacroRing + MacroBar
5. Mobile (< 768px): PortionPanel appears at top, bottom tab nav visible
6. Mobile: Ingredient list shows card layout instead of table
7. MacroRing correctly shows caloric ratio (protein*4 : carbs*4 : fat*9)
8. All existing functionality preserved (CRUD, AI lookup, inline editing)
9. Deploy to Cloudflare Pages
