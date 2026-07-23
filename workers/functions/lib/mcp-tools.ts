import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { AnyRouter } from '@trpc/server'
import { appRouter } from './router'

/**
 * Pure tRPC→MCP derivation helpers, split out from mcp.ts so the unit tests (mcp.test.ts) can
 * import them without pulling in mcp.ts's `WIDGET_HTML` import — a gitignored codegen artifact
 * (workers/functions/widgets/widgets.generated.ts) that only exists after `yarn generate:widget`.
 * Keeping the tested surface here means `yarn test` never depends on that artifact.
 */

export function procedurePathToToolName(path: string): string {
	return path.replaceAll('.', '_')
}

/**
 * Derive MCP tool annotations from a tRPC procedure's path + type, allowing per-procedure
 * `.meta()` overrides. Clients (Claude.ai, Cursor, etc.) use these to badge/group tools as
 * read-only, destructive, etc.
 *
 * Defaults:
 *   - `readOnlyHint`     ← procedure type (`query` → true, `mutation` → false)
 *   - `destructiveHint`  ← method name starts with `delete` or `remove` (mutations only)
 *   - `idempotentHint`   ← queries + `delete*`/`remove*`/`update*`/`set*`/`upsert*`/`save*`/`reorder*`
 *                          mutations. `create*`/`add*` are explicitly non-idempotent. Other
 *                          mutations stay unset.
 *   - `openWorldHint`    ← false (every procedure touches our own DB only)
 */
export function deriveAnnotations(
	procedurePath: string,
	type: 'query' | 'mutation' | 'subscription',
	meta: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }
): ToolAnnotations {
	const isQuery = type === 'query'
	const method = procedurePath.split('.').at(-1) ?? ''
	const looksDestructive = !isQuery && /^(delete|remove)/.test(method)
	const looksIdempotent = !isQuery && /^(delete|remove|update|set|upsert|save|reorder)/.test(method)
	const looksNonIdempotent = !isQuery && /^(create|add)/.test(method)
	const idempotentDefault = isQuery || looksIdempotent ? true : looksNonIdempotent ? false : undefined

	return {
		readOnlyHint: meta.readOnly ?? isQuery,
		destructiveHint: meta.destructive ?? (isQuery ? false : looksDestructive),
		idempotentHint: meta.idempotent ?? idempotentDefault,
		openWorldHint: meta.openWorld ?? false
	}
}

export interface McpToolDef {
	name: string
	description: string
	/** The raw Zod schema from tRPC's .input(), or undefined for no-input procedures */
	zodSchema: unknown
	procedurePath: string
	annotations: ToolAnnotations
}

/** Walk the tRPC router and extract procedures that have .meta({ description }) set */
export function extractMcpTools(router: AnyRouter): McpToolDef[] {
	const procedures = (router as any)._def.procedures as Record<string, any>
	const tools: McpToolDef[] = []

	for (const [path, procedure] of Object.entries(procedures)) {
		const meta = procedure._def?.meta
		if (!meta?.description) continue

		const inputs = procedure._def?.inputs as unknown[] | undefined
		const zodSchema = inputs?.[0]
		const type = procedure._def?.type as 'query' | 'mutation' | 'subscription'

		tools.push({
			name: procedurePathToToolName(path),
			description: meta.description,
			zodSchema,
			procedurePath: path,
			annotations: deriveAnnotations(path, type, meta)
		})
	}

	return tools
}

// Cache tool definitions at module scope
let cachedTools: McpToolDef[] | null = null

export function getTools(): McpToolDef[] {
	if (!cachedTools) {
		cachedTools = extractMcpTools(appRouter)
	}
	return cachedTools
}

/** JSON.stringify(undefined) is itself undefined — MCP requires content[].text to be a string. */
export function serializeToolResult(result: unknown): string {
	return result === undefined ? 'OK' : JSON.stringify(result, null, 2)
}
