/**
 * Recipe macro math moved to `@macromaxxing/db` so `recipe.search` can price a portion server-side
 * (workers/ can't import from src/). Re-exported here so the existing feature imports keep working —
 * same precedent as `src/lib/workouts/formulas.ts`.
 */
export * from '@macromaxxing/db/macros'
