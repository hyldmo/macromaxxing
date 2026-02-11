# Weekly Meal Planner Feature

## Summary

A template-based weekly meal planner for macro planning. Users create reusable week templates (Mon-Sun) with **per-plan inventory**. The workflow: add recipes to the plan's inventory (specifying total portions available), then allocate portions to day slots via drag or click.

---

## Core UX Decisions

| Aspect | Decision |
|--------|----------|
| **Week model** | Template weeks (Mon-Sun), not calendar dates |
| **Multiple plans** | 2-3 saved plans (cutting vs bulking) |
| **Inventory** | Per-plan recipe pool with portion tracking |
| **Add to inventory** | Modal with recipe search → add to plan's pool |
| **Portion count** | Default from recipe's yield, user can adjust |
| **Allocate to day** | Drag from inventory sidebar OR click empty slot |
| **Portion override** | Fractional allowed (0.5, 1.5, etc.) |
| **Over-allocation** | Allowed with warning (inventory shows negative/red) |
| **Meals per day** | Starts with 3 slots; grows dynamically |
| **Card detail** | Full macros per allocated portion |
| **Day layout** | Horizontal 7 columns (desktop), single-day view (mobile) |
| **Totals** | Daily totals + weekly average |
| **Edit existing** | Quick-action popover: portions, swap, copy, remove |

---

## Database Schema

**New tables** in `packages/db/schema.ts`:

```typescript
// Meal plan template
export const mealPlans = sqliteTable('meal_plans', {
  id: typeidCol('mpl')('id').primaryKey().$defaultFn(() => newId('mpl')),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),  // "Cutting Plan", "Bulk Week"
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

// Inventory: recipes added to a plan's pool
export const mealPlanInventory = sqliteTable('meal_plan_inventory', {
  id: typeidCol('mpi')('id').primaryKey().$defaultFn(() => newId('mpi')),
  mealPlanId: typeidCol('mpl')('meal_plan_id').notNull()
    .references(() => mealPlans.id, { onDelete: 'cascade' }),
  recipeId: typeidCol('rcp')('recipe_id').notNull()
    .references(() => recipes.id),
  totalPortions: real('total_portions').notNull(), // How many portions available
  createdAt: integer('created_at').notNull()
})

// Allocated meal slots (references inventory, not recipe directly)
export const mealPlanSlots = sqliteTable('meal_plan_slots', {
  id: typeidCol('mps')('id').primaryKey().$defaultFn(() => newId('mps')),
  inventoryId: typeidCol('mpi')('inventory_id').notNull()
    .references(() => mealPlanInventory.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),  // 0=Mon, 6=Sun
  slotIndex: integer('slot_index').notNull(),   // 0, 1, 2, 3...
  portions: real('portions').notNull().default(1), // Fractional allowed (0.5, 1.5)
  createdAt: integer('created_at').notNull()
})
```

**Drizzle relations** (also in schema.ts):
```typescript
export const mealPlansRelations = relations(mealPlans, ({ many }) => ({
  inventory: many(mealPlanInventory)
}))

export const mealPlanInventoryRelations = relations(mealPlanInventory, ({ one, many }) => ({
  mealPlan: one(mealPlans, { fields: [mealPlanInventory.mealPlanId], references: [mealPlans.id] }),
  recipe: one(recipes, { fields: [mealPlanInventory.recipeId], references: [recipes.id] }),
  slots: many(mealPlanSlots)
}))

export const mealPlanSlotsRelations = relations(mealPlanSlots, ({ one }) => ({
  inventory: one(mealPlanInventory, { fields: [mealPlanSlots.inventoryId], references: [mealPlanInventory.id] })
}))
```

**Key insight**: Slots reference `inventoryId` not `recipeId`. This means:
- Recipe data comes via `slot.inventory.recipe`
- Remaining portions = `inventory.totalPortions - sum(slots.portions)`

---

## tRPC API

**New file**: `workers/functions/lib/routes/mealPlans.ts`

```typescript
// Plan CRUD
mealPlan.list        // User's plans (name, inventory count, updated)
mealPlan.get         // Plan with inventory + slots + recipe data
mealPlan.create      // { name }
mealPlan.update      // { id, name }
mealPlan.delete      // { id }
mealPlan.duplicate   // { id, newName } - deep copy (plan + inventory + slots)

// Inventory operations (adding recipes to plan's pool)
mealPlan.addToInventory     // { planId, recipeId, totalPortions }
mealPlan.updateInventory    // { inventoryId, totalPortions }
mealPlan.removeFromInventory // { inventoryId } - cascades to slots

// Slot operations (allocating portions to days)
mealPlan.allocate    // { inventoryId, dayOfWeek, slotIndex, portions }
mealPlan.updateSlot  // { slotId, portions?, inventoryId? (for swap) }
mealPlan.removeSlot  // { slotId }
mealPlan.copySlot    // { slotId, targetDays: number[], targetSlotIndex }
```

**Register** in `workers/functions/lib/router.ts`:
```typescript
mealPlan: mealPlansRouter
```

---

## Component Architecture

```
src/features/mealPlans/
├── MealPlanListPage.tsx       # Grid of saved plans
├── MealPlannerPage.tsx        # Main planner view
└── components/
    ├── PlanHeader.tsx         # Name, duplicate/delete actions
    ├── WeekGrid.tsx           # 7-column container
    ├── DayColumn.tsx          # Day header + meal slots + totals
    ├── MealSlot.tsx           # Empty (droppable) or filled
    ├── MealCard.tsx           # Recipe name + portion + macros
    ├── MealPopover.tsx        # Quick actions (portions/swap/copy/remove)
    ├── InventorySidebar.tsx   # Left sidebar: recipes in plan's pool
    ├── InventoryCard.tsx      # Recipe + portions remaining + drag handle
    ├── AddToInventoryModal.tsx # Search recipes, set portion count, add
    ├── PortionEditor.tsx      # Adjust allocated portions
    ├── DayTotals.tsx          # P/C/F/kcal for the day
    └── WeeklyAverages.tsx     # Average across filled days
```

**Routes** (add to `src/router.tsx`):
```typescript
{ path: 'plans', element: <MealPlanListPage /> }
{ path: 'plans/:id', element: <MealPlannerPage /> }
```

---

## Key Interactions

### 1. Add Recipe to Inventory
- Click "+ Add Recipe" button in sidebar
- `AddToInventoryModal` opens with recipe search (reuse existing pattern)
- Shows recipe macros + default portion count from recipe
- User adjusts portion count if needed → Add
- Recipe appears in sidebar with "X portions available"

### 2. Allocate to Day (Drag)
- `InventorySidebar` shows recipes with remaining portions
- Drag `InventoryCard` → drop on empty slot
- Default allocation: 1 portion (editable via popover)
- Sidebar updates: "3/4 remaining" → "2/4 remaining"
- Over-allocation allowed but shows warning (e.g., "-1/4" in red)

### 3. Allocate to Day (Click)
- Click empty slot → picker shows only recipes from inventory
- Select recipe → allocates 1 portion
- Faster than drag for quick entry

### 4. Edit Portion (Quick Action)
- Click filled meal → `MealPopover` appears
- `PortionEditor`: adjust portion amount (0.5, 1, 1.5, 2, etc.)
- Live macro preview as user adjusts
- Save → `updateSlot` mutation

### 5. Copy Meal
- From popover: "Copy to..." opens day picker
- Check days (Mon, Tue, Wed...) and slot index
- `copySlot` mutation creates duplicates (consumes from same inventory)

### 6. Dynamic Slot Growth
- Days start with 3 visible empty slots
- When dragging over a 4th position, 4th slot appears
- No explicit "add slot" button needed—interaction-driven

---

## Layout

### Desktop (≥1024px)
```
┌──────────────────────────────────────────────────────────────────┐
│ [← Back]  Cutting Plan                    [Duplicate] [Delete]   │
├────────────┬────────────────────────────────────────────────────┤
│  INVENTORY │  Mon    │  Tue    │  Wed    │  Thu    │  Fri    │...│
│  ────────  ├─────────┼─────────┼─────────┼─────────┼─────────┤   │
│  [+ Add]   │ [Meal]  │ [Meal]  │ [empty] │ [Meal]  │ [empty] │   │
│            │ [Meal]  │ [empty] │ [empty] │ [Meal]  │ [Meal]  │   │
│ ┌────────┐ │ [empty] │ [empty] │ [empty] │ [empty] │ [Meal]  │   │
│ │Pasta   │ ├─────────┼─────────┼─────────┼─────────┼─────────┤   │
│ │2/4 left│ │ 2100kcal│ 1800kcal│    0    │ 2050kcal│ 1950kcal│   │
│ └────────┘ │ P 180g  │ P 150g  │         │ P 175g  │ P 160g  │   │
│ ┌────────┐ ├─────────┴─────────┴─────────┴─────────┴─────────┴───┤
│ │Chicken │ │  Weekly Avg: 1980 kcal · P 166g · C 200g · F 78g    │
│ │5/6 left│ └────────────────────────────────────────────────────┘
│ └────────┘
│ ┌────────┐
│ │Rice    │
│ │-1/3    │ ← over-allocated (red warning)
│ └────────┘
└────────────
```

### Mobile (<768px)
- Horizontal day tabs at top (Mon Tue Wed...)
- Single-day view fills screen
- Inventory sidebar becomes slide-in drawer (via FAB button)

---

## Component Designs

### InventoryCard (sidebar)
```tsx
<div className={cn(
  "rounded-md border bg-surface-1 p-2 cursor-grab",
  remaining < 0 && "border-destructive/50"  // Red when over-allocated
)}>
  <div className="flex items-center justify-between">
    <span className="truncate font-medium text-ink text-sm">{recipeName}</span>
    <button onClick={...}><X /></button> {/* Remove from inventory */}
  </div>
  <div className={cn(
    "mt-1 font-mono text-xs",
    remaining < 0 ? "text-destructive" : "text-ink-muted"
  )}>
    {remaining}/{total} portions
  </div>
</div>
```

### MealCard (in day slot)
```tsx
<div className="rounded-md border border-edge bg-surface-1 p-2">
  <div className="flex items-center justify-between">
    <span className="truncate font-medium text-ink text-sm">{recipeName}</span>
    <button><MoreVertical /></button> {/* triggers MealPopover */}
  </div>
  <div className="mt-1 text-ink-muted text-xs">
    {portions} portion{portions !== 1 && 's'}
  </div>
  <div className="mt-1.5 flex items-center gap-3 font-mono text-xs">
    <span className="text-macro-protein">P {protein}g</span>
    <span className="text-macro-carbs">C {carbs}g</span>
    <span className="text-macro-fat">F {fat}g</span>
    <span className="text-macro-kcal">{kcal}</span>
  </div>
  <MacroBar protein={protein} carbs={carbs} fat={fat} />
</div>
```

---

## Macro Calculations

Extend `src/features/recipes/utils/macros.ts`:

```typescript
// Calculate macros for allocated portions
// Uses recipe's portion macros × allocated portions
export function calculateSlotMacros(
  recipePortionMacros: AbsoluteMacros,  // Per-portion from recipe
  allocatedPortions: number             // e.g., 1.5
): AbsoluteMacros

// Sum all slots for a day
export function calculateDayTotals(slots: AbsoluteMacros[]): AbsoluteMacros

// Average across filled days (days with at least one meal)
export function calculateWeeklyAverage(dayTotals: AbsoluteMacros[]): AbsoluteMacros

// Calculate remaining portions for inventory display
export function calculateRemainingPortions(
  totalPortions: number,
  allocatedSlots: { portions: number }[]
): number  // Can be negative for over-allocation
```

---

## Files to Create/Modify

### Create
| File | Purpose |
|------|---------|
| `packages/db/drizzle/XXXX_meal_plans.sql` | Migration for 3 new tables |
| `workers/functions/lib/routes/mealPlans.ts` | tRPC routes |
| `src/features/mealPlans/MealPlanListPage.tsx` | Plan list page |
| `src/features/mealPlans/MealPlannerPage.tsx` | Main planner view |
| `src/features/mealPlans/components/InventorySidebar.tsx` | Left sidebar |
| `src/features/mealPlans/components/InventoryCard.tsx` | Draggable recipe card |
| `src/features/mealPlans/components/AddToInventoryModal.tsx` | Recipe search + add |
| `src/features/mealPlans/components/WeekGrid.tsx` | 7-column layout |
| `src/features/mealPlans/components/DayColumn.tsx` | Day with slots + totals |
| `src/features/mealPlans/components/MealSlot.tsx` | Drop target |
| `src/features/mealPlans/components/MealCard.tsx` | Allocated meal display |
| `src/features/mealPlans/components/MealPopover.tsx` | Quick actions |
| `src/features/mealPlans/components/PortionEditor.tsx` | Adjust portions |
| `src/features/mealPlans/components/DayTotals.tsx` | Daily macro summary |
| `src/features/mealPlans/components/WeeklyAverages.tsx` | Week average |

### Modify
| File | Change |
|------|--------|
| `packages/db/schema.ts` | Add 3 tables + relations |
| `workers/functions/lib/router.ts` | Register mealPlansRouter |
| `src/router.tsx` | Add /plans routes |
| `src/features/recipes/utils/macros.ts` | Add calculation functions |
| `src/components/Layout.tsx` | Add "Plans" nav link |

---

## Dependencies

**New package**: `@dnd-kit/core` for drag-drop
- Already used elsewhere in React ecosystem
- Accessible, works with keyboard
- `yarn add @dnd-kit/core @dnd-kit/sortable`

**UI primitives** (may need to create or use Radix):
- `Popover` for meal quick actions
- `Dialog/Modal` for recipe picker
- `Tabs` for mobile day navigation

---

## Verification

1. **DB**: Run `yarn db:generate && yarn db:migrate`, check 3 tables exist
2. **API**: Test routes via tRPC panel or Hono client
3. **List page**: Create plan, see it listed, click to open
4. **Inventory**:
   - Click "+ Add Recipe" → modal opens with search
   - Select recipe → set portions → Add
   - Recipe appears in sidebar with portion count
5. **Allocation**:
   - Drag from inventory → drop on slot → portion allocated
   - Sidebar shows decremented count (e.g., "3/4 left")
   - Click empty slot → shows inventory recipes → select → allocates
6. **Portion editing**:
   - Click filled meal → popover shows
   - Adjust portions (0.5, 1.5, etc.) → macros update live
   - Save → sidebar updates remaining count
7. **Over-allocation**:
   - Allocate more than available → sidebar shows negative in red
   - No blocking, just visual warning
8. **Totals**: Daily totals + weekly average update as meals change
9. **Copy**: Copy meal to other days → consumes additional portions
10. **Mobile**: Resize → day tabs appear, single-day view, FAB for inventory
