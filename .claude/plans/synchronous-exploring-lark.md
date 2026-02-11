# Drag-and-drop ingredient reordering in recipe editor

## Context
Ingredients in the recipe editor have a `sortOrder` column and the backend already accepts `sortOrder` in `updateIngredient`, but there's no UI to reorder them. The project already uses `@dnd-kit` for workout template exercises (same pattern: list of sortable items with a grip handle).

## Approach
Follow the existing `@dnd-kit` pattern from `WorkoutTemplatePage` / `TemplateExerciseRow`. The main difference: recipe ingredients live in a `<table>` and each ingredient renders **two** `<tr>` elements (data row + macro bar). We'll wrap each ingredient pair in its own `<tbody>` (valid HTML — tables can have multiple `<tbody>` elements) and make that the sortable element.

## Files to modify

### `src/features/recipes/components/RecipeIngredientTable.tsx`
- Import `DndContext`, `SortableContext`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors`, `arrayMove` from `@dnd-kit`
- Wrap `<tbody>` area with `DndContext` + `SortableContext` (items = ingredient IDs, vertical list strategy)
- Add `handleDragEnd`: compute new sort orders, call `recipe.updateIngredient` for each moved item
- Use optimistic reordering via tRPC cache update for instant feedback

### `src/features/recipes/components/RecipeIngredientRow.tsx`
- Import `useSortable` from `@dnd-kit/sortable` and `CSS` from `@dnd-kit/utilities`
- Call `useSortable({ id: ri.id })` to get `attributes`, `listeners`, `setNodeRef`, `transform`, `transition`, `isDragging`
- Wrap both `<tr>` elements in a `<tbody ref={setNodeRef} style={...}>` — this becomes the sortable element
- Add a `GripVertical` drag handle in the first cell (only when not `readOnly`), spreading `{...attributes} {...listeners}` on it
- Apply `isDragging && 'opacity-50'` styling

## Backend
No changes needed — `updateIngredient` already accepts `sortOrder`.

## Verification
- `yarn dev` → open a recipe → drag ingredients to reorder → verify order persists on refresh
- Verify read-only mode shows no drag handles
- Verify pending ingredient rows are unaffected
