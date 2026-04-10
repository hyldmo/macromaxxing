# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Macromaxxing's tRPC API as an MCP server so users can interact with their data through AI assistants like Claude Desktop.

**Architecture:** A tRPC-to-MCP bridge that walks the tRPC router for annotated procedures (`.meta()`), converts their Zod input schemas to JSON Schema, and registers them as MCP tools. Auth via personal access tokens stored in D1. Runs on existing Cloudflare Pages Functions.

**Tech Stack:** `@modelcontextprotocol/sdk` (WebStandardStreamableHTTPServerTransport), tRPC v11 meta, Zod v4 JSON Schema, Hono, D1

**Spec:** `docs/superpowers/specs/2026-04-10-mcp-server-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/db/schema.ts` | Modify | Add `apiTokens` table |
| `packages/db/relations.ts` | Modify | Add `apiTokens` relations |
| `packages/db/types.ts` | Modify | Export `ApiToken` type |
| `workers/functions/lib/trpc.ts` | Modify | Add `McpMeta` interface, `.meta<McpMeta>()` to init |
| `workers/functions/lib/mcp.ts` | Create | tRPC-to-MCP adapter (extractMcpTools, registerTools, handleMcpRequest) |
| `workers/functions/lib/mcp.test.ts` | Create | Tests for the adapter |
| `workers/functions/lib/mcp-auth.ts` | Create | Bearer token auth (hash + lookup) |
| `workers/functions/lib/mcp-auth.test.ts` | Create | Tests for token hashing |
| `workers/functions/api/[[route]].ts` | Modify | Mount `/api/mcp` route with CORS + bearer auth |
| `workers/functions/lib/routes/settings.ts` | Modify | Add token CRUD endpoints + `.meta()` on `get` |
| `workers/functions/lib/routes/recipes.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/ingredients.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/mealPlans.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/workouts.ts` | Modify | Add `.meta()` to curated procedures |
| `workers/functions/lib/routes/dashboard.ts` | Modify | Add `.meta()` to summary |
| `workers/functions/lib/routes/ai.ts` | Modify | Add `.meta()` to lookup + parseRecipe |
| `src/features/settings/SettingsPage.tsx` | Modify | Add API Tokens UI section |

---

### Task 1: Install MCP SDK

**Files:**
- Modify: `workers/package.json`

- [ ] **Step 1: Add the MCP SDK package**

```bash
cd workers && yarn add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify install**

```bash
yarn check
```

Expected: passes (no type errors from new dep)

- [ ] **Step 3: Commit**

```bash
git add workers/package.json yarn.lock
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Add `apiTokens` table to schema

**Files:**
- Modify: `packages/db/schema.ts`
- Modify: `packages/db/relations.ts`
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add apiTokens table to schema.ts**

Add after the `userSettings` table definition (around line 36):

```typescript
export const apiTokens = sqliteTable(
	'api_tokens',
	{
		id: typeidCol('atok')('id')
			.primaryKey()
			.$defaultFn(() => newId('atok')),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		lastUsedAt: integer('last_used_at'),
		createdAt: integer('created_at').notNull()
	},
	t => [index('api_tokens_user_id_idx').on(t.userId), uniqueIndex('api_tokens_hash_idx').on(t.tokenHash)]
)
```

- [ ] **Step 2: Add relation in relations.ts**

In the `users` block, add:
```typescript
apiTokens: r.many.apiTokens()
```

Add new relation block:
```typescript
apiTokens: {
	user: r.one.users({
		from: r.apiTokens.userId,
		to: r.users.id,
		optional: false
	})
}
```

- [ ] **Step 3: Export type in types.ts**

Add import of `apiTokens` from `'./schema'` and add:
```typescript
export type ApiToken = InferSelectModel<typeof apiTokens>
```

- [ ] **Step 4: Generate migration**

```bash
yarn db:generate
```

This creates a new migration folder in `packages/db/drizzle/`.

- [ ] **Step 5: Apply migration locally**

```bash
yarn db:migrate
```

- [ ] **Step 6: Verify types**

```bash
yarn check
```

Expected: passes

- [ ] **Step 7: Commit**

```bash
git add packages/db/
git commit -m "feat: add apiTokens table for MCP personal access tokens"
```

---

### Task 3: Add McpMeta to tRPC init

**Files:**
- Modify: `workers/functions/lib/trpc.ts`

- [ ] **Step 1: Add McpMeta interface and chain .meta()**

In `workers/functions/lib/trpc.ts`, add the interface and modify the tRPC init:

```typescript
export interface McpMeta {
	description: string
}

const t = initTRPC.context<TRPCContext>().meta<McpMeta>().create()
```

The `meta` field becomes optional on all procedures. Existing procedures without `.meta()` are unaffected.

- [ ] **Step 2: Verify types**

```bash
yarn check
```

Expected: passes. No existing code breaks because meta is optional.

- [ ] **Step 3: Commit**

```bash
git add workers/functions/lib/trpc.ts
git commit -m "feat: add McpMeta type to tRPC init for MCP tool annotations"
```

---

### Task 4: Bearer token auth module

**Files:**
- Create: `workers/functions/lib/mcp-auth.ts`
- Create: `workers/functions/lib/mcp-auth.test.ts`

- [ ] **Step 1: Write the test for hashToken**

Create `workers/functions/lib/mcp-auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { hashToken } from './mcp-auth'

describe('hashToken', () => {
	it('produces a consistent hex hash for the same input', async () => {
		const hash1 = await hashToken('test-token-123')
		const hash2 = await hashToken('test-token-123')
		expect(hash1).toBe(hash2)
	})

	it('produces different hashes for different inputs', async () => {
		const hash1 = await hashToken('token-a')
		const hash2 = await hashToken('token-b')
		expect(hash1).not.toBe(hash2)
	})

	it('returns a 64-character hex string (SHA-256)', async () => {
		const hash = await hashToken('any-token')
		expect(hash).toMatch(/^[a-f0-9]{64}$/)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test workers/functions/lib/mcp-auth.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement mcp-auth.ts**

Create `workers/functions/lib/mcp-auth.ts`:

```typescript
import { apiTokens, users } from '@macromaxxing/db'
import { eq } from 'drizzle-orm'
import type { AuthUser } from './auth'
import type { Database } from './db'

/** SHA-256 hash a raw token to a hex string for storage/lookup */
export async function hashToken(raw: string): Promise<string> {
	const data = new TextEncoder().encode(raw)
	const buffer = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(buffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

/** Generate a random API token (32 bytes, hex-encoded = 64 chars) */
export function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

/** Authenticate a request by bearer token. Returns the user or null. */
export async function authenticateByToken(db: Database, authHeader: string | null): Promise<AuthUser | null> {
	if (!authHeader?.startsWith('Bearer ')) return null
	const raw = authHeader.slice(7)
	if (!raw) return null

	const hash = await hashToken(raw)
	const token = await db.query.apiTokens.findFirst({
		where: { tokenHash: hash }
	})
	if (!token) return null

	// Update lastUsedAt
	await db
		.update(apiTokens)
		.set({ lastUsedAt: Date.now() })
		.where(eq(apiTokens.id, token.id))

	const user = await db.query.users.findFirst({
		where: { id: token.userId }
	})
	if (!user) return null

	return { id: user.id, email: user.email }
}
```

- [ ] **Step 4: Run tests**

```bash
yarn test workers/functions/lib/mcp-auth.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/functions/lib/mcp-auth.ts workers/functions/lib/mcp-auth.test.ts
git commit -m "feat: add bearer token auth module for MCP endpoint"
```

---

### Task 5: Token CRUD endpoints in settings router

**Files:**
- Modify: `workers/functions/lib/routes/settings.ts`

- [ ] **Step 1: Add token CRUD procedures**

In `workers/functions/lib/routes/settings.ts`, add imports at the top:

```typescript
import { apiTokens } from '@macromaxxing/db'
import { generateToken, hashToken } from '../mcp-auth'
```

Add three new procedures inside the `settingsRouter`:

```typescript
listTokens: protectedProcedure.query(async ({ ctx }) => {
	const tokens = await ctx.db.query.apiTokens.findMany({
		where: { userId: ctx.user.id },
		orderBy: { createdAt: 'desc' }
	})
	return tokens.map(t => ({
		id: t.id,
		name: t.name,
		lastUsedAt: t.lastUsedAt,
		createdAt: t.createdAt
	}))
}),

createToken: protectedProcedure
	.input(z.object({ name: z.string().min(1).max(100) }))
	.mutation(async ({ ctx, input }) => {
		const raw = generateToken()
		const hash = await hashToken(raw)
		const [token] = await ctx.db
			.insert(apiTokens)
			.values({
				userId: ctx.user.id,
				name: input.name,
				tokenHash: hash,
				createdAt: Date.now()
			})
			.returning()
		// Return the raw token ONCE. It cannot be retrieved again.
		return { id: token.id, name: token.name, token: raw }
	}),

deleteToken: protectedProcedure
	.input(z.object({ id: z.custom<TypeIDString<'atok'>>() }))
	.mutation(async ({ ctx, input }) => {
		await ctx.db
			.delete(apiTokens)
			.where(and(eq(apiTokens.id, input.id), eq(apiTokens.userId, ctx.user.id)))
	}),
```

Update the imports at the top of the file:
- Add `and` to the `drizzle-orm` import: `import { and, eq } from 'drizzle-orm'`
- Add `TypeIDString` to the `@macromaxxing/db` import

- [ ] **Step 2: Verify types**

```bash
yarn check
```

Expected: passes

- [ ] **Step 3: Commit**

```bash
git add workers/functions/lib/routes/settings.ts
git commit -m "feat: add token CRUD endpoints (listTokens, createToken, deleteToken)"
```

---

### Task 6: tRPC-to-MCP adapter

**Files:**
- Create: `workers/functions/lib/mcp.ts`
- Create: `workers/functions/lib/mcp.test.ts`

- [ ] **Step 1: Write tests for the adapter**

Create `workers/functions/lib/mcp.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { procedurePathToToolName } from './mcp'

describe('procedurePathToToolName', () => {
	it('converts dot-separated path to underscore', () => {
		expect(procedurePathToToolName('recipe.list')).toBe('recipe_list')
	})

	it('handles nested paths', () => {
		expect(procedurePathToToolName('workout.muscleGroupStats')).toBe('workout_muscleGroupStats')
	})

	it('handles single-segment paths', () => {
		expect(procedurePathToToolName('dashboard')).toBe('dashboard')
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test workers/functions/lib/mcp.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the adapter**

Create `workers/functions/lib/mcp.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { AnyRouter } from '@trpc/server'
import { toJSONSchema } from 'zod'
import type { AuthUser } from './auth'
import type { Database } from './db'
import { appRouter, type AppRouter } from './router'

export function procedurePathToToolName(path: string): string {
	return path.replaceAll('.', '_')
}

interface McpToolDef {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	procedurePath: string
}

/** Walk the tRPC router and extract procedures that have .meta() set */
export function extractMcpTools(router: AnyRouter): McpToolDef[] {
	const procedures = (router as any)._def.procedures as Record<string, any>
	const tools: McpToolDef[] = []

	for (const [path, procedure] of Object.entries(procedures)) {
		const meta = procedure._def?.meta
		if (!meta?.description) continue

		// Extract the first input schema (tRPC stores inputs as an array)
		const inputs = procedure._def?.inputs as any[] | undefined
		const zodSchema = inputs?.[0]

		const inputSchema = zodSchema ? toJSONSchema(zodSchema) : { type: 'object', properties: {} }

		tools.push({
			name: procedurePathToToolName(path),
			description: meta.description,
			inputSchema: inputSchema as Record<string, unknown>,
			procedurePath: path
		})
	}

	return tools
}

// Cache tool definitions at module scope (extracted once, reused per request)
let cachedTools: McpToolDef[] | null = null

function getTools(): McpToolDef[] {
	if (!cachedTools) {
		cachedTools = extractMcpTools(appRouter)
	}
	return cachedTools
}

/** Traverse a nested object by dot-separated path */
function traverseCaller(caller: any, path: string): (...args: any[]) => Promise<any> {
	const parts = path.split('.')
	let current = caller
	for (const part of parts) {
		current = current[part]
	}
	return current
}

/** Handle an MCP request. Creates a fresh McpServer + transport per request (stateless). */
export async function handleMcpRequest(
	request: Request,
	db: Database,
	user: AuthUser,
	env: any
): Promise<Response> {
	const server = new McpServer(
		{ name: 'macromaxxing', version: '1.0.0' },
		{ jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
	)

	// Create a tRPC caller with the user's auth context
	const createCaller = appRouter.createCaller
	const caller = createCaller({ db, user, env })

	// Register all annotated tools
	const tools = getTools()
	for (const tool of tools) {
		server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
			try {
				const fn = traverseCaller(caller, tool.procedurePath)
				const result = await fn(args)
				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
				}
			} catch (err: any) {
				return {
					content: [{ type: 'text' as const, text: err.message ?? 'Unknown error' }],
					isError: true
				}
			}
		})
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined // stateless
	})

	await server.connect(transport)
	return transport.handleRequest(request)
}
```

**Note on CfWorkerJsonSchemaValidator:** If `McpServer` doesn't accept the validator option (API varies by version), fall back to the low-level `Server` class from `@modelcontextprotocol/sdk/server/index.js` which accepts it in its constructor options. Test early with `yarn dev:api` to catch this on the Workers runtime, not just type checking.

**Note on `toJSONSchema`:** The `z.custom<>()` schemas used for TypeID fields may not convert cleanly to JSON Schema since they use opaque validation functions. If `toJSONSchema` throws on these, use a fallback `{ type: 'string' }` for the affected fields.

- [ ] **Step 4: Run tests**

```bash
yarn test workers/functions/lib/mcp.test.ts
```

Expected: PASS (at least for procedurePathToToolName)

- [ ] **Step 5: Verify types**

```bash
yarn check
```

Expected: passes. If `McpServer` or transport imports fail on CF Workers types, check if `CfWorkerJsonSchemaValidator` is needed and switch to the low-level `Server` class.

- [ ] **Step 6: Commit**

```bash
git add workers/functions/lib/mcp.ts workers/functions/lib/mcp.test.ts
git commit -m "feat: add tRPC-to-MCP adapter with tool extraction and request handling"
```

---

### Task 7: Mount MCP endpoint in Hono

**Files:**
- Modify: `workers/functions/api/[[route]].ts`

- [ ] **Step 1: Add MCP route with CORS and bearer auth**

In `workers/functions/api/[[route]].ts`, add imports:

```typescript
import { cors } from 'hono/cors'
import { authenticateByToken } from '../lib/mcp-auth'
import { handleMcpRequest } from '../lib/mcp'
```

Add the MCP CORS middleware and route handler BEFORE the tRPC handler (order matters in Hono):

```typescript
// MCP endpoint - route-level CORS with MCP-specific headers
app.use(
	'/api/mcp',
	cors({
		origin: '*',
		allowMethods: ['POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version', 'Authorization'],
		exposeHeaders: ['mcp-session-id', 'mcp-protocol-version']
	})
)

app.all('/api/mcp', async c => {
	const db = createDb(c.env.DB)
	const user = await authenticateByToken(db, c.req.header('Authorization'))
	if (!user) {
		return c.json({ error: 'Unauthorized. Provide a valid bearer token.' }, 401)
	}
	return handleMcpRequest(c.req.raw, db, user, c.env)
})
```

Using `app.all` so the MCP SDK's transport can handle method routing internally (it returns 405 for non-POST in stateless mode).

- [ ] **Step 2: Verify types**

```bash
yarn check
```

Expected: passes

- [ ] **Step 3: Test locally**

```bash
yarn dev:api
```

Then in another terminal:
```bash
curl -X POST http://localhost:8788/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

Expected: 401 Unauthorized (no token provided)

- [ ] **Step 4: Commit**

```bash
git add workers/functions/api/[[route]].ts
git commit -m "feat: mount MCP endpoint at /api/mcp with bearer token auth"
```

---

### Task 8: Annotate tRPC procedures with .meta()

**Files:**
- Modify: `workers/functions/lib/routes/recipes.ts`
- Modify: `workers/functions/lib/routes/ingredients.ts`
- Modify: `workers/functions/lib/routes/mealPlans.ts`
- Modify: `workers/functions/lib/routes/workouts.ts`
- Modify: `workers/functions/lib/routes/dashboard.ts`
- Modify: `workers/functions/lib/routes/ai.ts`
- Modify: `workers/functions/lib/routes/settings.ts`

- [ ] **Step 1: Annotate recipes router**

In `workers/functions/lib/routes/recipes.ts`, add `.meta()` to each curated procedure. Insert `.meta({ description: '...' })` in the procedure chain before `.input()` or `.query()`/`.mutation()`:

```
list:             .meta({ description: 'List all recipes with macro summaries' })
get:              .meta({ description: 'Get recipe details with ingredients and macros' })
create:           .meta({ description: 'Create a new recipe' })
update:           .meta({ description: 'Update recipe name, instructions, portions, or visibility' })
delete:           .meta({ description: 'Delete a recipe' })
addIngredient:    .meta({ description: 'Add an ingredient to a recipe by ingredient ID' })
updateIngredient: .meta({ description: 'Update ingredient amount, unit, or preparation in a recipe' })
removeIngredient: .meta({ description: 'Remove an ingredient from a recipe' })
```

Example for `list`:
```typescript
list: publicProcedure
	.meta({ description: 'List all recipes with macro summaries' })
	.query(async ({ ctx }) => {
```

- [ ] **Step 2: Annotate ingredients router**

In `workers/functions/lib/routes/ingredients.ts`:

```
list:           .meta({ description: 'List ingredients with nutrition data per 100g' })
create:         .meta({ description: 'Create a custom ingredient with macro values' })
findOrCreate:   .meta({ description: 'Find or create ingredient via USDA lookup then AI fallback' })
```

- [ ] **Step 3: Annotate meal plans router**

In `workers/functions/lib/routes/mealPlans.ts`:

```
list:                .meta({ description: 'List meal plans' })
get:                 .meta({ description: 'Get meal plan with inventory and weekly slot allocations' })
create:              .meta({ description: 'Create a new meal plan' })
update:              .meta({ description: 'Update meal plan name' })
delete:              .meta({ description: 'Delete a meal plan' })
addToInventory:      .meta({ description: 'Add a recipe to meal plan inventory with portion count' })
removeFromInventory: .meta({ description: 'Remove a recipe from meal plan inventory' })
allocate:            .meta({ description: 'Allocate portions to a day and slot in the meal plan' })
removeSlot:          .meta({ description: 'Remove a portion allocation from a meal plan slot' })
```

- [ ] **Step 4: Annotate workouts router**

In `workers/functions/lib/routes/workouts.ts`:

```
listWorkouts:      .meta({ description: 'List workout templates' })
getWorkout:        .meta({ description: 'Get workout template with exercises and targets' })
listSessions:      .meta({ description: 'List workout sessions with dates' })
getSession:        .meta({ description: 'Get workout session with logged sets per exercise' })
muscleGroupStats:  .meta({ description: 'Get volume per muscle group over N days' })
```

- [ ] **Step 5: Annotate dashboard router**

In `workers/functions/lib/routes/dashboard.ts`:

```
summary: .meta({ description: "Get today's meals, recent workout sessions, and macro progress" })
```

- [ ] **Step 6: Annotate AI router**

In `workers/functions/lib/routes/ai.ts`:

```
lookup:      .meta({ description: 'Look up ingredient nutrition via USDA database or AI' })
parseRecipe: .meta({ description: 'Parse a recipe from URL or pasted text into structured ingredients' })
```

- [ ] **Step 7: Annotate settings router**

In `workers/functions/lib/routes/settings.ts`:

```
get: .meta({ description: 'Get user settings (AI provider, body profile)' })
```

- [ ] **Step 8: Verify types**

```bash
yarn check
```

Expected: passes

- [ ] **Step 9: Commit**

```bash
git add workers/functions/lib/routes/
git commit -m "feat: annotate tRPC procedures with .meta() for MCP tool exposure"
```

---

### Task 9: End-to-end local test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

```bash
yarn dev:api
```

- [ ] **Step 2: Create a test user and token**

Since we need a user + token to test, use the dev mode. First, verify the API works:

```bash
# Check that the MCP endpoint rejects unauthenticated requests
curl -s -X POST http://localhost:8788/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

Expected: 401 response

- [ ] **Step 3: Create a token via tRPC (using dev auth)**

```bash
# Create a token using the dev auth header
curl -s -X POST http://localhost:8788/api/trpc/settings.createToken \
  -H "Content-Type: application/json" \
  -H "X-Dev-User-Email: test@dev.local" \
  -d '{"json":{"name":"test-mcp"}}' | jq .
```

Save the returned `token` value.

- [ ] **Step 4: Test MCP initialize with token**

```bash
TOKEN="<paste token from step 3>"
curl -s -X POST http://localhost:8788/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

Expected: JSON-RPC response with server info and capabilities

- [ ] **Step 5: Test tools/list**

**Note:** In stateless mode, each request creates a brand new server. There is no session continuity between requests. For curl testing, each request is self-contained. Real MCP clients (Claude Desktop) handle the initialize/tools/call lifecycle automatically.

```bash
# List tools (the server auto-handles initialization in stateless mode)
curl -s -X POST http://localhost:8788/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq .
```

Expected: list of tools with names like `recipe_list`, `ingredient_findOrCreate`, etc. If the server rejects this without a prior `initialize`, send `initialize` first in the same curl, then `tools/list` in a second request. Both will work independently since stateless mode creates a fresh server each time.

- [ ] **Step 6: Test a tool call**

```bash
curl -s -X POST http://localhost:8788/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"recipe_list","arguments":{}}}' | jq .
```

Expected: JSON-RPC result with recipe list (may be empty for a fresh DB, but should not error)

---

### Task 10: API Tokens UI in Settings

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx`

- [ ] **Step 1: Add token list and create/delete UI**

Add a new Card section after the existing AI Provider card in `SettingsPage.tsx`. This section shows:
- The MCP endpoint URL with a copy button
- List of existing tokens (name, created date, last used)
- "Create Token" button that opens an inline form for the token name
- After creation, show the raw token once with a copy button and a warning that it can't be shown again
- Delete button per token with confirmation

Use these tRPC hooks:
```typescript
const tokensQuery = trpc.settings.listTokens.useQuery()
const createMutation = trpc.settings.createToken.useMutation({
	onSuccess: () => utils.settings.listTokens.invalidate()
})
const deleteMutation = trpc.settings.deleteToken.useMutation({
	onSuccess: () => utils.settings.listTokens.invalidate()
})
```

The MCP endpoint URL: `${window.location.origin}/api/mcp`

Use existing UI components: `Card`, `CardHeader`, `CardContent`, `Button`, `Input`.

- [ ] **Step 2: Verify it renders**

```bash
yarn dev:web
```

Navigate to `/settings`. The new "API Tokens" section should appear.

- [ ] **Step 3: Run full check**

```bash
yarn check
```

Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsPage.tsx
git commit -m "feat: add API Tokens UI section to Settings page"
```

---

### Task 11: Final verification and docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run full check**

```bash
yarn check
```

Expected: all pass

- [ ] **Step 2: Update CLAUDE.md**

Add to the API Structure section:
```
# MCP endpoint (Model Context Protocol)
POST   /api/mcp                            # MCP server (bearer token auth, stateless)
```

Add to the tRPC endpoints in API Structure:
```
trpc.settings.listTokens/createToken/deleteToken    # Personal access token management
```

Add a new section:
```
**MCP Server** -- Exposes annotated tRPC procedures as MCP tools via `@modelcontextprotocol/sdk`. Auth via personal access tokens (bearer). Stateless mode (new server per request). Configure in Settings > API Tokens.
```

Update the DB Schema section to include:
```
apiTokens(id typeid:atok, userId FK, name, tokenHash unique, lastUsedAt?, createdAt)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add MCP server and API tokens to CLAUDE.md"
```
