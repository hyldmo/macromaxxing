# Unit Support for Ingredients

Add proper unit support with AI auto-population. Always store grams internally.

## Overview

- New `ingredient_units` table stores unit-to-gram conversions per ingredient
- AI/USDA populates common units when ingredients are created
- Each ingredient has a default unit (e.g., sweet potato → "pcs", whey → "scoop")
- Optional `density` column enables volume-to-weight calculations
- Display format: "2 scoops (45g)"

## Schema Changes

### New Table: `ingredient_units`

```sql
CREATE TABLE ingredient_units (
  id TEXT PRIMARY KEY,           -- TypeID 'inu_...'
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,            -- 'tbsp', 'scoop', 'pcs', 'medium'
  grams REAL NOT NULL,           -- Grams per 1 unit
  is_default INTEGER DEFAULT 0,  -- Default unit for this ingredient
  source TEXT NOT NULL,          -- 'usda' | 'ai' | 'manual'
  created_at INTEGER NOT NULL,
  UNIQUE(ingredient_id, name)
);
```

### Modify: `ingredients`

```sql
ALTER TABLE ingredients ADD COLUMN density REAL;  -- g/ml, for volume conversions
```

### Modify: `recipe_ingredients`

```sql
ALTER TABLE recipe_ingredients ADD COLUMN display_unit TEXT;    -- 'scoop' | NULL (grams)
ALTER TABLE recipe_ingredients ADD COLUMN display_amount REAL;  -- 2 | NULL
```

## Data Flow

### When AI/USDA creates ingredient "Sugar":

```typescript
// AI returns:
{
  name: "Sugar",
  protein: 0, carbs: 100, fat: 0, kcal: 387, fiber: 0,
  density: 0.85,  // g/ml
  units: [
    { name: "tbsp", grams: 12.5, isDefault: false },
    { name: "tsp", grams: 4.2, isDefault: false },
    { name: "cup", grams: 200, isDefault: false },
    { name: "g", grams: 1, isDefault: true }
  ]
}
```

### When AI/USDA creates ingredient "Sweet Potato":

```typescript
{
  name: "Sweet Potato",
  protein: 1.6, carbs: 20, fat: 0.1, kcal: 86, fiber: 3,
  density: null,  // Not applicable for solids
  units: [
    { name: "pcs", grams: 130, isDefault: true },  // 1 medium
    { name: "medium", grams: 130, isDefault: false },
    { name: "large", grams: 180, isDefault: false },
    { name: "g", grams: 1, isDefault: false }
  ]
}
```

### When user enters "2 tbsp sugar":

1. Parse: amount=2, unit="tbsp", ingredient="sugar"
2. Lookup: `ingredient_units WHERE ingredient_id=sugar AND name='tbsp'` → grams=12.5
3. Calculate: `amountGrams = 2 × 12.5 = 25`
4. Store: `{ amountGrams: 25, displayUnit: 'tbsp', displayAmount: 2 }`

## Files to Modify

| File | Changes |
|------|---------|
| `packages/db/schema.ts` | Add `ingredientUnits` table, `density` to ingredients, display fields to recipeIngredients |
| `packages/db/relations.ts` | Add ingredientUnits relations |
| `workers/functions/lib/routes/ingredients.ts` | Update create to handle units from AI, add unit CRUD |
| `workers/functions/lib/routes/ai.ts` | Update AI prompt to return density + units |
| `workers/functions/lib/routes/recipes.ts` | Update add/update ingredient with display fields |
| `src/features/ingredients/components/IngredientForm.tsx` | Add unit management section |
| `src/features/recipes/components/RecipeIngredientRow.tsx` | Add unit selector, show "(Xg)" |
| `src/features/recipes/components/IngredientSearchInput.tsx` | Parse units in paste input |

## AI Prompt Changes

Update `workers/functions/lib/routes/ai.ts` to request:

```typescript
const schema = z.object({
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  kcal: z.number(),
  fiber: z.number(),
  density: z.number().nullable(),  // g/ml for liquids/powders, null for solids
  units: z.array(z.object({
    name: z.string(),       // 'tbsp', 'pcs', 'medium', 'scoop'
    grams: z.number(),      // grams per 1 unit
    isDefault: z.boolean()  // true for the most natural unit
  }))
})
```

Prompt addition:
> Also provide common units for measuring this ingredient with their gram equivalents.
> For liquids/powders, include tbsp, tsp, cup, dl. For whole items, include pcs, small, medium, large.
> Set isDefault=true for the most natural unit (e.g., "pcs" for eggs, "g" for flour).
> Include density in g/ml for liquids and powders (null for solid items).

## Standard Units Reference

| Unit | Type | ml | Common grams (varies by ingredient) |
|------|------|-----|-------------------------------------|
| tsp | volume | 5 | ~4-6g |
| tbsp | volume | 15 | ~12-18g |
| cup | volume | 240 | ~120-240g |
| dl | volume | 100 | ~80-120g |
| ml | volume | 1 | varies by density |
| pcs | piece | - | varies by ingredient |
| small | piece | - | varies |
| medium | piece | - | varies |
| large | piece | - | varies |
| g | weight | - | 1 |

## UI Changes

### Ingredient Form
- Display existing units in a list
- Allow adding custom units (name + grams)
- Mark one as default

### Recipe Ingredient Row
```
Edit mode:   [2.0] [tbsp ▼]  (25g)
Read mode:   2 tbsp (25g)
```

Unit dropdown shows:
- All units from `ingredient_units` for this ingredient
- "g" is always available

### Ingredient Search Input
Enhanced parsing:
- "2 tbsp sugar" → { amount: 2, unit: "tbsp", name: "sugar" }
- "1 sweet potato" → { amount: 1, unit: "pcs", name: "sweet potato" }
- "500g flour" → { amount: 500, unit: "g", name: "flour" }

## Implementation Order

1. Schema migration (new table + columns)
2. Update AI prompt to return units + density
3. Update ingredient create to store units
4. Add unit selector to RecipeIngredientRow
5. Update IngredientSearchInput parsing
6. Add unit management UI to IngredientForm

## Verification

1. Create ingredient via AI → verify units are populated
2. Add "2 tbsp sugar" to recipe → verify 25g stored, displays "2 tbsp (25g)"
3. Add "1 sweet potato" → verify defaults to pcs, shows "1 pcs (130g)"
4. Edit ingredient → add custom "scoop" unit → use in recipe
5. Existing ingredients without units → fall back to grams only
