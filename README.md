# macromaxxing

A recipe nutrition tracker for fitness enthusiasts who meal prep. Track macros per portion with precision.

## Features

- **Recipe Management** — Create recipes with ingredients, track cooked weight vs raw weight, define portion sizes
- **Macro Visualization** — MacroRing (donut chart showing P/C/F caloric ratio), MacroBar (stacked horizontal bar), per-portion readouts
- **AI-Powered Ingredient Lookup** — Look up nutritional data using Gemini, OpenAI, or Anthropic APIs (BYOK)
- **Responsive Design** — Two-column editor on desktop, mobile-first with bottom tab navigation

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite 7 + Tailwind CSS 4
- tRPC + TanStack Query for data fetching
- react-router-dom for routing

**Backend:**
- Cloudflare Pages Functions (Hono + tRPC)
- Cloudflare D1 (SQLite) with Drizzle ORM
- AES-GCM encrypted API key storage

## Project Structure

```
src/
├── components/
│   ├── layout/           # RootLayout, Nav (desktop top + mobile bottom tabs)
│   └── ui/               # Button, Card, Input, Spinner, TRPCError
├── features/
│   ├── recipes/
│   │   ├── components/   # MacroRing, MacroBar, MacroReadout, PortionPanel, etc.
│   │   ├── hooks/        # useRecipeCalculations
│   │   ├── utils/        # macros.ts (caloricRatio, calculatePortionMacros, etc.)
│   │   ├── RecipeListPage.tsx
│   │   └── RecipeEditorPage.tsx
│   ├── ingredients/
│   │   ├── components/   # IngredientForm
│   │   └── IngredientListPage.tsx
│   └── settings/
│       └── SettingsPage.tsx   # AI provider configuration
├── lib/
│   ├── trpc.ts           # tRPC client setup
│   └── cn.ts             # clsx + tailwind-merge utility
└── index.css             # Design tokens (surfaces, ink, macro colors, etc.)

functions/
├── api/[[route]].ts      # Cloudflare Pages function entry
└── lib/
    ├── schema.ts         # Drizzle schema (users, ingredients, recipes, etc.)
    ├── relations.ts      # Drizzle relations
    ├── router.ts         # tRPC app router
    ├── trpc.ts           # tRPC context + procedures
    ├── auth.ts           # Cookie-based auth
    ├── crypto.ts         # AES-GCM encryption helpers
    └── routes/
        ├── recipes.ts    # CRUD + ingredient management
        ├── ingredients.ts
        ├── settings.ts   # AI provider config (encrypted keys)
        └── ai.ts         # Multi-provider AI lookup
```

## AI Features

The app supports three AI providers for ingredient nutritional data lookup:

| Provider | Default Model | API Endpoint |
|----------|---------------|--------------|
| Gemini | `gemini-2.0-flash` | Google AI Generative Language API |
| OpenAI | `gpt-4o-mini` | OpenAI Chat Completions |
| Anthropic | `claude-sonnet-4-20250514` | Anthropic Messages API |

**How it works:**
1. User configures their API key in Settings (encrypted with AES-GCM before storage)
2. When adding an ingredient, user can click "AI Lookup" with an ingredient name
3. Backend decrypts the key, calls the selected provider with a system prompt requesting USDA-style JSON
4. Response is validated with Zod schema and returned to the client

**System prompt used:**
```
You are a nutrition database. Given a food ingredient name, return nutritional values per 100g raw weight as JSON: { "protein": number, "carbs": number, "fat": number, "kcal": number, "fiber": number }. Use USDA data. Return ONLY the JSON object, no markdown, no explanation.
```

## Design System

Dark theme with warm soapstone undertones. Key tokens in `src/index.css`:

- **Surfaces:** `surface-0` (base), `surface-1` (cards), `surface-2` (hover/elevated)
- **Ink:** `ink` (primary text), `ink-muted` (secondary), `ink-faint` (tertiary)
- **Macro colors:** `macro-protein` (copper), `macro-carbs` (golden), `macro-fat` (olive), `macro-kcal` (warm orange), `macro-fiber` (sage)
- **Accent:** Copper (`oklch(0.72 0.15 50)`)
- **Depth:** Borders-only strategy (no shadows), `edge` border color
- **Radius:** Sharp (`4px`/`6px`) for instrument-grade precision

## Development

```bash
# Install dependencies
yarn

# Run dev server (frontend + backend)
yarn dev

# Build
yarn build

# Lint/format
yarn lint
yarn fix

# Database migrations
yarn db:generate   # Generate migration from schema changes
yarn db:migrate    # Apply migrations to local D1
```

## Environment Variables

Required in Cloudflare Pages:
- `ENCRYPTION_SECRET` — 32-byte hex string for AES-GCM key encryption

## License

MIT
