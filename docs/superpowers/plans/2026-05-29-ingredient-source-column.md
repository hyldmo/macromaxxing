# Ingredient Source Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the USDA-specific `ingredients.fdcId` integer with a generic `sourceId` text column discriminated by `source`, add `openfoodfacts` as a first-class source, and fix barcode scans that currently mislabel themselves as `manual`.

**Architecture:** `source` (already a column) is the discriminator; a new nullable `sourceId text` holds the vendor's external record id — USDA `fdcId` as a decimal string, Open Food Facts barcode (digit string, leading zeros significant). A small pure registry in `@macromaxxing/db` maps `(source, sourceId)` → external URL so the "interpret by source" logic lives in one place and future food APIs slot in with no schema change. `fdcId` is a value-based logical join (no FK, no Drizzle relation), so dropping it only touches app-level lookups, not constraints.

**Tech Stack:** Drizzle ORM v1 (SQLite/D1), tRPC, Zod, React 19, Vitest.

**Working-tree note:** The OFF `packageSize` → `pkg` unit feature is already applied (uncommitted) in `src/lib/openfoodfacts.ts`, `workers/functions/lib/routes/ingredients.ts` (`create` accepts `units`), `src/routes/ingredients._index.tsx`, and `src/features/recipes/components/IngredientSearchInput.tsx`. This plan extends those edits — it does not start from pristine versions.

**Decisions locked during brainstorming:**
- Approach A: drop `fdcId`, add `source_id text`, migrate `fdc_id → source_id`, rewrite USDA value-joins.
- `label` stays a fifth `source` value (option i) — no axis split.
- `ai.lookup` keeps returning `fdcId` in its DTO (it describes a USDA match; not an ingredient row).
- Wire data + registry now; the in-UI source link is a deferred follow-up, out of scope here.

---

## File Structure

- `packages/db/custom-types.ts` — **modify**: add canonical `ingredientSource` zod enum + `IngredientSource` type (single source of truth; today the values are inline in `ingredients.ts`).
- `packages/db/ingredient-source.ts` — **create**: pure `getSourceUrl(source, sourceId)` + `SOURCE_REGISTRY`.
- `packages/db/ingredient-source.test.ts` — **create**: unit tests for the helper.
- `packages/db/schema.ts` — **modify**: drop `fdcId`, add `sourceId`.
- `packages/db/drizzle/<generated>/…` — **create** (via `yarn db:generate`, then hand-edit): add/copy/drop migration.
- `workers/functions/lib/routes/ingredients.ts` — **modify**: Zod schemas, `insertIngredientWithUnits`, `createFromUSDA` dedup, `findOrCreate`/`batchFindOrCreate` inserts.
- `src/routes/ingredients._index.tsx` — **modify**: scan handler → `source: 'openfoodfacts'` + `sourceId: barcode`.
- `src/features/recipes/components/IngredientSearchInput.tsx` — **modify**: scan handler (same) + `localFdcIds` dedup off `sourceId`.
- `CLAUDE.md` — **modify**: schema doc line + source registry note.

Unaffected (verified): `scripts/seed-usda.ts` (uses `usda_foods.fdc_id` cache table), `scripts/copy-to-prod.ts`/`copy-from-prod.ts` (`SELECT *` + dynamic columns), `packages/db/relations.ts` (only relation on `fdcId` is `usdaPortions↔usdaFoods`), `workers/functions/lib/ai-utils.ts` + `ai.ts` (operate on USDA cache, return `fdcId` DTOs — intentionally kept).

---

### Task 1: Centralize the source enum + source-URL registry (TDD)

**Files:**
- Modify: `packages/db/custom-types.ts`
- Create: `packages/db/ingredient-source.ts`
- Test: `packages/db/ingredient-source.test.ts`

- [ ] **Step 1: Add the canonical source enum to `custom-types.ts`**

Add after the `zAiProvider` block (around line 25):

```ts
export const ingredientSource = z.enum(['manual', 'ai', 'usda', 'openfoodfacts', 'label'])
export type IngredientSource = z.infer<typeof ingredientSource>
```

- [ ] **Step 2: Write the failing test**

Create `packages/db/ingredient-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getSourceUrl } from './ingredient-source'

describe('getSourceUrl', () => {
	it('builds a USDA FoodData Central URL from a numeric fdcId string', () => {
		expect(getSourceUrl('usda', '173410')).toBe('https://fdc.nal.usda.gov/food-details/173410')
	})

	it('builds an Open Food Facts URL from a barcode, preserving leading zeros', () => {
		expect(getSourceUrl('openfoodfacts', '0123456789012')).toBe(
			'https://world.openfoodfacts.org/product/0123456789012'
		)
	})

	it('returns null for sources with no external record', () => {
		expect(getSourceUrl('manual', null)).toBeNull()
		expect(getSourceUrl('ai', null)).toBeNull()
	})

	it('returns null when sourceId is missing for a known source', () => {
		expect(getSourceUrl('usda', null)).toBeNull()
	})
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test packages/db/ingredient-source.test.ts`
Expected: FAIL — cannot resolve `./ingredient-source`.

- [ ] **Step 4: Implement the registry**

Create `packages/db/ingredient-source.ts`:

```ts
import type { IngredientSource } from './custom-types'

interface SourceMeta {
	label: string
	externalUrl: (sourceId: string) => string
}

/** Sources that carry a re-queryable external record. manual/ai/label have no entry. */
const SOURCE_REGISTRY: Partial<Record<IngredientSource, SourceMeta>> = {
	usda: {
		label: 'USDA',
		externalUrl: id => `https://fdc.nal.usda.gov/food-details/${id}`
	},
	openfoodfacts: {
		label: 'Open Food Facts',
		externalUrl: id => `https://world.openfoodfacts.org/product/${id}`
	}
}

/** Resolve the external product/record URL for an ingredient, or null when none applies. */
export function getSourceUrl(source: IngredientSource, sourceId: string | null): string | null {
	if (!sourceId) return null
	return SOURCE_REGISTRY[source]?.externalUrl(sourceId) ?? null
}
```

- [ ] **Step 5: Re-export from the package barrel if one exists**

Check `packages/db/index.ts` (or equivalent entry). If it re-exports `custom-types`/`formulas`, add `export * from './ingredient-source'` alongside. If there is no barrel and consumers import deep paths, skip.

Run: `grep -n "export \* from" packages/db/index.ts` to confirm the pattern before editing.

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn test packages/db/ingredient-source.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/db/custom-types.ts packages/db/ingredient-source.ts packages/db/ingredient-source.test.ts packages/db/index.ts
git commit -m "feat(db): add ingredientSource enum + getSourceUrl registry"
```

---

### Task 2: Schema change + data-preserving migration

**Files:**
- Modify: `packages/db/schema.ts:74`
- Create (generated, then hand-edited): `packages/db/drizzle/<timestamp>_<name>/migration.sql` + `snapshot.json` + flat `packages/db/drizzle/<timestamp>_<name>.sql`

- [ ] **Step 1: Edit the schema**

In `packages/db/schema.ts`, in the `ingredients` table, replace:

```ts
		fdcId: integer('fdc_id'), // USDA FoodData Central ID
```

with:

```ts
		sourceId: text('source_id'), // external record id: USDA fdcId (as text) or OFF barcode; null for manual/ai
```

Leave the `integer` import in place (still used by other tables). `text` is already imported.

- [ ] **Step 2: Generate the migration**

Run: `yarn db:generate`
This writes `packages/db/drizzle/<timestamp>_<name>/migration.sql` + `snapshot.json`, runs `db:flatten` to emit the flat `<timestamp>_<name>.sql`, and updates the snapshot to the new shape (no `fdc_id`, has `source_id`).

- [ ] **Step 3: Replace the generated SQL body with the add/copy/drop sequence**

drizzle-kit will NOT emit the data copy (and may emit a bare drop or a table rebuild). Open the generated `<timestamp>_<name>/migration.sql` and set its body to exactly:

```sql
ALTER TABLE `ingredients` ADD `source_id` text;--> statement-breakpoint
UPDATE `ingredients` SET `source_id` = CAST(`fdc_id` AS text) WHERE `fdc_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `fdc_id`;
```

Mirror the identical three statements into the flat `packages/db/drizzle/<timestamp>_<name>.sql` (the flatten step only adds `IF NOT EXISTS` to `CREATE TABLE`/`CREATE INDEX`, so these `ALTER`/`UPDATE` lines stay verbatim). Do not edit `snapshot.json` by hand — it already reflects the final shape.

- [ ] **Step 4: Format (snapshot.json is emitted 2-space; biome wants tabs)**

Run: `yarn fix`

- [ ] **Step 5: Apply to local D1 and verify**

Run: `yarn db:migrate`
(Per project rule: use `yarn db:migrate`, never `wrangler d1 migrations apply` — it silently skips Drizzle subdir migrations.)

Verify the column flipped and data copied:

Run: `yarn wrangler d1 execute <local-db-binding> --local --command "PRAGMA table_info(ingredients);"` (binding name is in `workers/wrangler.toml`; expect `source_id`, no `fdc_id`).
Expected: a `source_id` row present, no `fdc_id` row.

- [ ] **Step 6: Commit (subdir + flat .sql + snapshot together)**

```bash
git add packages/db/schema.ts packages/db/drizzle/
git commit -m "feat(db): migrate ingredients.fdc_id to generic source_id"
```

---

### Task 3: Backend — schemas, helper, and USDA dedup

**Files:**
- Modify: `workers/functions/lib/routes/ingredients.ts`

- [ ] **Step 1: Import the canonical enum**

In the top imports of `ingredients.ts`, add `ingredientSource` to the `@macromaxxing/db` import:

```ts
import { ingredients, ingredientUnits, ingredientSource, zodTypeID } from '@macromaxxing/db'
```

- [ ] **Step 2: Update `createIngredientSchema`**

Replace:

```ts
	density: z.number().nonnegative().nullable().optional(),
	fdcId: z.number().int().nullable().optional(),
	source: z.enum(['manual', 'ai', 'usda', 'label']),
	units: z.array(z.object({ name: z.string().min(1), grams: z.number().positive() })).optional()
})
```

with:

```ts
	density: z.number().nonnegative().nullable().optional(),
	sourceId: z.string().nullable().optional(),
	source: ingredientSource,
	units: z.array(z.object({ name: z.string().min(1), grams: z.number().positive() })).optional()
})
```

- [ ] **Step 3: Update `updateIngredientSchema`**

Replace:

```ts
	density: z.number().nonnegative().nullable().optional(),
	fdcId: z.number().int().nullable().optional(),
	source: z.enum(['manual', 'ai', 'usda']).optional()
})
```

with:

```ts
	density: z.number().nonnegative().nullable().optional(),
	sourceId: z.string().nullable().optional(),
	source: ingredientSource.optional()
})
```

- [ ] **Step 4: Update `insertIngredientWithUnits` signature + insert**

In the `data` parameter type, replace `fdcId?: number | null` with `sourceId?: string | null`. In the `.insert(ingredients).values({...})`, replace `fdcId: data.fdcId ?? null,` with `sourceId: data.sourceId ?? null,`.

- [ ] **Step 5: Update the three `insertIngredientWithUnits` call sites to pass `sourceId`**

USDA passes a numeric `fdcId`; stringify it.
- In `createFromUSDA` (the `insertIngredientWithUnits(ctx.db, ctx.user.id, { … fdcId: input.fdcId … })` call): replace `fdcId: input.fdcId,` with `sourceId: String(input.fdcId),`.
- In `findOrCreate` USDA branch (`{ … fdcId: usdaData.fdcId … }`): replace `fdcId: usdaData.fdcId,` with `sourceId: String(usdaData.fdcId),`.
- In `batchFindOrCreate` (`insertIngredientWithUnits(ctx.db, ctx.user.id, { name, macros, fdcId, density, source, units })`): replace `fdcId,` with `sourceId: fdcId != null ? String(fdcId) : null,`.

(The AI-only `findOrCreate` insert has no `fdcId` today — leave it; `sourceId` defaults to null.)

- [ ] **Step 6: Update the `createFromUSDA` dedup query**

Replace:

```ts
				const existing = await ctx.db.query.ingredients.findFirst({
					where: { fdcId: input.fdcId },
					with: { units: true }
				})
```

with:

```ts
				const existing = await ctx.db.query.ingredients.findFirst({
					where: { source: 'usda', sourceId: String(input.fdcId) },
					with: { units: true }
				})
```

- [ ] **Step 7: Confirm `create` passthrough needs nothing further**

`create` does `const { units, ...data } = input` then spreads `...data` into the insert. `sourceId` is now part of `data` and is a real column, so it flows through. No edit needed beyond the schema (Step 2).

- [ ] **Step 8: Typecheck**

Run: `yarn check`
Expected: green. The frontend `r.ingredient.fdcId` reference (Task 5) will still be a typecheck error until Task 5 lands — if running tasks out of order, expect that single error here and resolve it in Task 5.

- [ ] **Step 9: Commit**

```bash
git add workers/functions/lib/routes/ingredients.ts
git commit -m "refactor(ingredients): use generic sourceId, dedup USDA by source+sourceId"
```

---

### Task 4: Scan handlers — tag OFF scans correctly + persist barcode

**Files:**
- Modify: `src/routes/ingredients._index.tsx` (`handleBarcodeProduct`, ~line 44)
- Modify: `src/features/recipes/components/IngredientSearchInput.tsx` (`handleBarcodeProduct`, ~line 244)

- [ ] **Step 1: Fix the ingredient-list scan handler**

In `src/routes/ingredients._index.tsx`, replace:

```ts
				source: 'manual',
				units: product.packageSize ? [{ name: 'pkg', grams: product.packageSize }] : undefined
			})
```

with:

```ts
				source: 'openfoodfacts',
				sourceId: product.barcode,
				units: product.packageSize ? [{ name: 'pkg', grams: product.packageSize }] : undefined
			})
```

- [ ] **Step 2: Fix the in-recipe scan handler**

In `src/features/recipes/components/IngredientSearchInput.tsx`, replace:

```ts
				source: 'manual',
				units: product.packageSize ? [{ name: 'pkg', grams: product.packageSize }] : undefined
			})
```

with:

```ts
				source: 'openfoodfacts',
				sourceId: product.barcode,
				units: product.packageSize ? [{ name: 'pkg', grams: product.packageSize }] : undefined
			})
```

- [ ] **Step 3: Typecheck**

Run: `yarn check`
Expected: `source: 'openfoodfacts'` now type-checks against `createIngredientSchema` (it accepts the centralized enum). The `localFdcIds` error from Task 5 may still be present.

- [ ] **Step 4: Commit**

```bash
git add src/routes/ingredients._index.tsx src/features/recipes/components/IngredientSearchInput.tsx
git commit -m "fix(scan): tag barcode scans as openfoodfacts and persist barcode as sourceId"
```

---

### Task 5: Frontend — dedup USDA search results off `sourceId`

**Files:**
- Modify: `src/features/recipes/components/IngredientSearchInput.tsx:280-282`

- [ ] **Step 1: Update the dedup set**

Replace:

```ts
	// USDA results: filter out items that match local ingredients by fdcId
	const localFdcIds = new Set(searchResults.map(r => r.ingredient.fdcId).filter(Boolean))
	const usdaResults = (usdaSearchQuery.data ?? []).filter(r => !localFdcIds.has(r.fdcId))
```

with:

```ts
	// USDA results: filter out items already saved locally as USDA ingredients (match on fdcId)
	const localFdcIds = new Set(
		searchResults
			.map(r => (r.ingredient.source === 'usda' && r.ingredient.sourceId ? Number(r.ingredient.sourceId) : null))
			.filter((id): id is number => id !== null)
	)
	const usdaResults = (usdaSearchQuery.data ?? []).filter(r => !localFdcIds.has(r.fdcId))
```

(`r.fdcId` on the last line is the USDA *search-result* DTO from `searchUSDA`, which still carries `fdcId` — unchanged.)

- [ ] **Step 2: Full check**

Run: `yarn check`
Expected: green (lint + typecheck + test). No remaining `.fdcId` references on the `ingredient` type.

- [ ] **Step 3: Commit**

```bash
git add src/features/recipes/components/IngredientSearchInput.tsx
git commit -m "refactor(ingredients): dedup USDA search by source+sourceId"
```

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md` (DB Schema section)

- [ ] **Step 1: Update the schema line**

In the `## DB Schema` block, replace:

```
ingredients(id typeid:ing, userId, name, protein/carbs/fat/kcal/fiber per 100g raw, density?, fdcId?, source: manual|ai|usda|label)
```

with:

```
ingredients(id typeid:ing, userId, name, protein/carbs/fat/kcal/fiber per 100g raw, density?, sourceId?, source: manual|ai|usda|openfoodfacts|label)
```

- [ ] **Step 2: Add a one-line note where ingredient sources are described**

Near the nutrition-lookup / premade notes, add:

```
**Ingredient source linkage** — `source` discriminates provenance; `sourceId` holds the vendor's external record id (USDA `fdcId` as text, OFF barcode). `getSourceUrl(source, sourceId)` from `@macromaxxing/db` builds the external link; `manual`/`ai` have no `sourceId`. Barcode scans are tagged `source: 'openfoodfacts'` (not `manual`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document generic ingredient source/sourceId model"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run the full check suite**

Run: `yarn check`
Expected: lint, typecheck, and test all green.

- [ ] **Step 2: Manual smoke (if a dev server / barcode is available)**

Scan a real product on the Ingredients page. Confirm the created ingredient has `source: 'openfoodfacts'`, a `sourceId` equal to the barcode, and a `pkg` unit when the product reported a package size. (If no camera/barcode is available, state that the live scan path was not exercised.)

---

## Self-Review

**Spec coverage:**
- Generic column replacing vendor id → Task 2 (`source_id`), Task 3 (schema/helper).
- Copy existing data over → Task 2 Step 3 (`UPDATE … CAST(fdc_id AS text)`).
- Logic that interprets source by type → Task 1 (`getSourceUrl`/`SOURCE_REGISTRY`).
- Fix scans mislabeled `manual` → Task 4 (`source: 'openfoodfacts'`).
- `openfoodfacts` as a source value → Task 1 (`ingredientSource` enum), consumed in Tasks 3-4.
- No FKs to update → confirmed in plan header (no `.references()`, no relation); nothing to do.
- Docs in sync → Task 6.

**Placeholder scan:** No TBD/TODO. The only unknowable is the drizzle-generated migration directory name (`<timestamp>_<name>`), inherent to `db:generate`; the SQL body to write is exact.

**Type consistency:** `ingredientSource` enum defined in Task 1 is imported and used in Task 3 schemas; `sourceId` is `string | null` everywhere (schema `text`, Zod `z.string().nullable().optional()`, helper param `string | null`, USDA writes `String(fdcId)`, frontend reads via `Number(sourceId)`). `getSourceUrl` signature matches its test and its (deferred) callers.
