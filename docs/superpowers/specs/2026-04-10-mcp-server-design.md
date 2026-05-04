# MCP Server for Macromaxxing

Expose Macromaxxing's tRPC API as an MCP (Model Context Protocol) server so users can interact with their recipe, nutrition, meal plan, and workout data through AI assistants like Claude Desktop.

## Goals

- Let users query and modify their Macromaxxing data through any MCP-compatible AI client
- Full CRUD: recipes, ingredients, meal plans, workouts, sessions
- Auto-generate MCP tool definitions from annotated tRPC procedures (no manual duplication)
- Personal access tokens for MCP auth (v1), OAuth 2.0 as future enhancement
- Runs on the existing Cloudflare Pages Functions infrastructure (no new services)

## Non-Goals

- MCP resources/prompts (tools only for v1)
- Streaming tool results (single response per tool call)
- Image upload via MCP (tRPC doesn't support multipart; keep using the Hono routes)
- Local CLI MCP server package (remote-only for now)

## Architecture

### Transport

Uses `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport`. This transport uses Web Standard APIs (`Request`, `Response`, `ReadableStream`) and works natively on Cloudflare Workers.

**Stateless mode**: a new `McpServer` + transport instance is created per request. This is required because the stateless transport cannot be reused across requests (the SDK enforces this). Workers are inherently stateless, so this is the natural fit. No Durable Objects needed.

**Endpoint**: `POST /api/mcp` mounted as a Hono route alongside existing tRPC routes. In stateless mode, only POST is needed (GET is for SSE streaming and DELETE is for session termination, neither of which applies here). The transport's `handleRequest` returns 405 for unsupported methods automatically.

### tRPC-to-MCP Bridge

The bridge has three parts:

#### 1. Meta Type on tRPC Init

Add `.meta<McpMeta>()` to the tRPC init chain so procedures can carry metadata:

```typescript
// workers/functions/lib/trpc.ts
export interface McpMeta {
  description: string
}

const t = initTRPC.context<TRPCContext>().meta<McpMeta>().create()
```

`meta` is optional on procedures. Only procedures with `.meta()` become MCP tools.

#### 2. Procedure Annotations

Add `.meta({ description })` to curated procedures:

```typescript
list: publicProcedure
  .meta({ description: 'List all recipes with macro summaries' })
  .query(async ({ ctx }) => { ... })
```

#### 3. Adapter Module (`workers/functions/lib/mcp.ts`)

Three functions:

- **`extractMcpTools(router)`** -- walks `appRouter._def.procedures` (flat `Record<string, AnyProcedure>`), filters for procedures with non-null `._def.meta`, extracts Zod input schemas, converts to JSON Schema via `toJSONSchema(schema)` from `'zod/v4/json-schema'`. Returns a list of `{ name, description, inputSchema, procedurePath }`. **Called once at module scope and cached**, not per-request.

- **`registerTools(mcpServer, caller, tools)`** -- for each tool, calls `mcpServer.tool(name, description, jsonSchema, handler)`. The handler traverses the tRPC caller proxy by splitting the procedure path on `.` (e.g., `recipe.list` becomes `caller.recipe.list(input)`). Results are serialized as JSON text content. Errors from tRPC procedures (e.g., `TRPCError`) are caught and returned as `{ content: [{ type: 'text', text: error.message }], isError: true }`.

- **`handleMcpRequest(request, env, user)`** -- creates fresh `McpServer({ name: 'macromaxxing', version: '1.0.0' })` + `WebStandardStreamableHTTPServerTransport()`, creates a tRPC caller with the user's auth context, registers tools from the cached tool list, calls `server.connect(transport)`, returns `transport.handleRequest(request)`.

**Note on tRPC internals**: `_def.procedures` is a semi-public API used by tRPC adapters. If it changes in a future tRPC version, the adapter would need updating. This is an acceptable tradeoff vs. maintaining a separate registry file.

#### Tool Naming

tRPC procedure paths like `recipe.list` become MCP tool names `recipe_list` (dots replaced with underscores). The namespace prefix (e.g., `recipe_`) already provides grouping context.

### JSON Schema Validation

Cloudflare Workers don't support dynamic code evaluation which the default AJV validator uses. Use the CF-specific validator:

```typescript
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker.js'
```

If `McpServer` (high-level class) handles this internally, this may not be needed. Test during implementation and fall back to the low-level `Server` class if needed.

### CORS

The existing global `cors()` middleware already sets `origin: '*'`. For the `/api/mcp` route, extend the allowed/exposed headers to include MCP-specific ones. Apply as a route-level override so it doesn't affect other routes:

```typescript
// Route-level CORS for /api/mcp only
app.use('/api/mcp', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version', 'Authorization'],
  exposeHeaders: ['mcp-session-id', 'mcp-protocol-version']
}))
```

## Authentication

### Personal Access Tokens (v1)

MCP clients (Claude Desktop, etc.) don't have Clerk cookies. They need bearer token auth.

`@cloudflare/workers-oauth-provider` requires Durable Objects, which Pages Functions don't support. Full OAuth 2.0 would need a separate Worker. For v1, personal access tokens are simpler and sufficient.

**Schema addition**: new `apiTokens` table in D1:

```
apiTokens(id typeid:atok, userId FK, name, tokenHash, lastUsedAt?, createdAt)
```

Tokens are hashed (SHA-256) before storage. The raw token is shown once on creation.

**Flow:**
1. User goes to Settings, creates a personal access token with a name (e.g., "Claude Desktop")
2. App generates a random token, shows it once, stores the SHA-256 hash in `apiTokens`
3. User pastes the token into their MCP client config
4. MCP requests include `Authorization: Bearer <token>`
5. The `/api/mcp` handler hashes the bearer token, looks up the hash in `apiTokens`, resolves the user

**tRPC endpoints:**
- `settings.listTokens` -- list tokens (name, created, last used; NOT the token itself)
- `settings.createToken` -- create token, return raw value once
- `settings.deleteToken` -- revoke a token

**Auth middleware** for `/api/mcp`: separate from the Clerk cookie auth. Extracts bearer token from `Authorization` header, hashes it, looks up the user in `apiTokens`, returns `AuthUser`.

**Settings UI**: new "API Tokens" section showing:
- MCP endpoint URL with copy button
- Token list (name, created date, last used)
- "Create Token" button with name input
- Delete button per token

## Curated Tool List

~24 procedures annotated for MCP exposure:

### Recipes
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `recipe.list` | `recipe_list` | List recipes with macro summaries |
| `recipe.get` | `recipe_get` | Get recipe details with ingredients and macros |
| `recipe.create` | `recipe_create` | Create a new recipe |
| `recipe.update` | `recipe_update` | Update recipe name, instructions, portions |
| `recipe.delete` | `recipe_delete` | Delete a recipe |
| `recipe.addIngredient` | `recipe_addIngredient` | Add ingredient to a recipe |
| `recipe.updateIngredient` | `recipe_updateIngredient` | Update ingredient amount/unit in recipe |
| `recipe.removeIngredient` | `recipe_removeIngredient` | Remove ingredient from recipe |

### Ingredients
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `ingredient.list` | `ingredient_list` | List ingredients with nutrition data per 100g |
| `ingredient.create` | `ingredient_create` | Create a custom ingredient with macros |
| `ingredient.findOrCreate` | `ingredient_findOrCreate` | Find or create ingredient (USDA then AI lookup) |

### Meal Plans
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `mealPlan.list` | `mealPlan_list` | List meal plans |
| `mealPlan.get` | `mealPlan_get` | Get meal plan with inventory and weekly slots |
| `mealPlan.create` | `mealPlan_create` | Create a meal plan |
| `mealPlan.addToInventory` | `mealPlan_addToInventory` | Add recipe to plan inventory |
| `mealPlan.allocate` | `mealPlan_allocate` | Allocate portions to day/slot |
| `mealPlan.update` | `mealPlan_update` | Update meal plan name |
| `mealPlan.delete` | `mealPlan_delete` | Delete a meal plan |
| `mealPlan.removeFromInventory` | `mealPlan_removeFromInventory` | Remove recipe from plan inventory |
| `mealPlan.removeSlot` | `mealPlan_removeSlot` | Remove a portion allocation |

### Workouts
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `workout.listWorkouts` | `workout_listWorkouts` | List workout templates |
| `workout.getWorkout` | `workout_getWorkout` | Get workout template with exercises and targets |
| `workout.listSessions` | `workout_listSessions` | List workout sessions with dates and stats |
| `workout.getSession` | `workout_getSession` | Get session with logged sets per exercise |
| `workout.muscleGroupStats` | `workout_muscleGroupStats` | Volume per muscle group over N days |

### Dashboard and AI
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `dashboard.summary` | `dashboard_summary` | Today's meals, recent sessions, macro progress |
| `ai.lookup` | `ai_lookup` | Look up ingredient nutrition via USDA/AI |
| `ai.parseRecipe` | `ai_parseRecipe` | Parse recipe from URL or text |

### Settings
| tRPC Path | Tool Name | Description |
|-----------|-----------|-------------|
| `settings.get` | `settings_get` | Get user settings (provider, profile) |

## Files

| File | Change | Purpose |
|------|--------|---------|
| `workers/functions/lib/trpc.ts` | Modify | Add `McpMeta` type and `.meta<McpMeta>()` to init |
| `workers/functions/lib/mcp.ts` | New | tRPC-to-MCP adapter (extractMcpTools, registerTools, handleMcpRequest) |
| `workers/functions/lib/mcp-auth.ts` | New | Bearer token auth middleware for MCP endpoint |
| `workers/functions/api/[[route]].ts` | Modify | Mount `/api/mcp` route with bearer auth + MCP handler |
| `workers/functions/lib/routes/recipes.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/ingredients.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/mealPlans.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/workouts.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/dashboard.ts` | Modify | Add `.meta()` to summary procedure |
| `workers/functions/lib/routes/ai.ts` | Modify | Add `.meta()` to lookup/parseRecipe procedures |
| `workers/functions/lib/routes/settings.ts` | Modify | Add `.meta()` to get + token CRUD procedures |
| `packages/db/schema.ts` | Modify | Add `apiTokens` table |
| `src/features/settings/SettingsPage.tsx` | Modify | Add API Tokens section with MCP endpoint URL |
| `workers/package.json` | Modify | Add `@modelcontextprotocol/sdk` |

## Dependencies

New packages:
- `@modelcontextprotocol/sdk` -- official MCP TypeScript SDK

## Testing

- Unit test for `extractMcpTools`: verify it finds annotated procedures and skips unannotated ones
- Unit test for tool name conversion: `recipe.list` to `recipe_list`
- Unit test for JSON Schema generation from Zod input schemas
- Integration test: send MCP `initialize` + `tools/list` + `tools/call` requests to `/api/mcp`
- Manual test: connect Claude Desktop to the MCP endpoint, run queries

## Future Enhancements

- MCP resources (expose recipe/meal plan data as browseable resources)
- MCP prompts (pre-built prompt templates like "Plan my meals for the week")
- Streaming responses for long-running AI operations
- Local CLI package (`npx macromaxxing-mcp`) for offline/self-hosted use
- OAuth 2.0 auth (requires separate Worker for Durable Objects, or `@cloudflare/workers-oauth-provider`)
- Token refresh and revocation UI in Settings
