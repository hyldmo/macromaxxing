# Macromaxxing

Recipe nutrition tracker for meal preppers. Track macros per portion.

## Stack

- **Frontend:** React 19, Vite 7, Tailwind 4, tRPC, react-router-dom
- **Backend:** Cloudflare Pages Functions (Hono + tRPC), D1 (SQLite), Drizzle ORM
- **Auth:** Cookie-based, user ID in context
- **AI:** Multi-provider (Gemini/OpenAI/Anthropic), BYOK, keys encrypted with AES-GCM

## Commands

```bash
yarn dev          # Dev server
yarn build        # Build
yarn fix          # Lint + format (Biome)
yarn db:generate  # Generate migration from schema
yarn db:migrate   # Apply migrations to local D1
```

## Key Files

| Task | Location |
|------|----------|
| DB schema | `functions/lib/schema.ts` |
| tRPC routes | `functions/lib/routes/*.ts` |
| Macro calculations | `src/features/recipes/utils/macros.ts` |
| Design tokens | `src/index.css` |
| UI components | `src/components/ui/` |
| Recipe components | `src/features/recipes/components/` |

## Design Tokens

Use these Tailwind classes (defined in `src/index.css`):

**Surfaces:** `bg-surface-0` (base), `bg-surface-1` (cards), `bg-surface-2` (hover)
**Text:** `text-ink`, `text-ink-muted`, `text-ink-faint`
**Border:** `border-edge`
**Macro colors:** `text-macro-protein`, `text-macro-carbs`, `text-macro-fat`, `text-macro-kcal`, `text-macro-fiber`
**Accent:** `bg-accent`, `text-accent`, `hover:bg-accent-hover`
**Radius:** `rounded-[--radius-sm]` (4px), `rounded-[--radius-md]` (6px)

No shadows — borders-only depth strategy.

## Patterns

- All numbers use `font-mono tabular-nums`
- Macro visualization: `MacroRing` (donut), `MacroBar` (stacked bar), `MacroReadout` (single value)
- Forms use `Input` from `~/components/ui/Input`
- Buttons use `Button` with variants: `default`, `destructive`, `outline`, `ghost`
- Cards use `Card`, `CardHeader`, `CardContent` from `~/components/ui/Card`
- tRPC client: `import { trpc } from '~/lib/trpc'`
- React components should have this style, using implicit return if possible:
	```tsx
	export interface CookedWeightInputProps {
		cookedWeight: number | null
		rawTotal: number
		onChange: (value: number | null) => void
	}

	export const CookedWeightInput: FC<CookedWeightInputProps> = ({ cookedWeight, rawTotal, onChange }) => <div>...
	```

## API Structure

```
trpc.recipe.list/get/create/update/delete
trpc.recipe.addIngredient/updateIngredient/removeIngredient
trpc.ingredient.list/get/create/update/delete
trpc.settings.get/save
trpc.ai.lookup  # Returns { protein, carbs, fat, kcal, fiber } per 100g
```

## After Making Changes

Keep documentation in sync:

- **New routes/features** → Update API Structure section above + README.md
- **New design tokens** → Update Design Tokens section above
- **New components/patterns** → Update Patterns section above
- **New commands** → Update Commands section above + README.md
- **Schema changes** → Update README.md project structure if new tables added
