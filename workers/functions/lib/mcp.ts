import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { AnyRouter } from '@trpc/server'
import type { AuthUser } from './auth'
import type { Database } from './db'
import { appRouter } from './router'

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
 *   - `openWorldHint`    ← false (every procedure touches our own DB only)
 *   - `idempotentHint`   ← unset (no safe default; opt in via meta)
 */
export function deriveAnnotations(
	procedurePath: string,
	type: 'query' | 'mutation' | 'subscription',
	meta: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }
): ToolAnnotations {
	const isQuery = type === 'query'
	const method = procedurePath.split('.').at(-1) ?? ''
	const looksDestructive = !isQuery && /^(delete|remove)/.test(method)

	return {
		readOnlyHint: meta.readOnly ?? isQuery,
		destructiveHint: meta.destructive ?? (isQuery ? false : looksDestructive),
		idempotentHint: meta.idempotent,
		openWorldHint: meta.openWorld ?? false
	}
}

interface McpToolDef {
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

function getTools(): McpToolDef[] {
	if (!cachedTools) {
		cachedTools = extractMcpTools(appRouter)
	}
	return cachedTools
}

/** Traverse a nested caller object by dot-separated path to get the procedure function */
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
	env: Cloudflare.Env
): Promise<Response> {
	const server = new McpServer(
		{ name: 'macromaxxing', version: '1.0.0' },
		{ jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
	)

	const caller = appRouter.createCaller({ db, user, env })

	const tools = getTools()
	for (const tool of tools) {
		const baseConfig = { description: tool.description, annotations: tool.annotations }
		if (tool.zodSchema) {
			// Pass the raw Zod schema — the MCP SDK converts to JSON Schema internally
			server.registerTool(
				tool.name,
				{ ...baseConfig, inputSchema: tool.zodSchema as any },
				async (args: Record<string, unknown>) => {
					try {
						const fn = traverseCaller(caller, tool.procedurePath)
						const result = await fn(args)
						return {
							content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
						}
					} catch (err: unknown) {
						const message = err instanceof Error ? err.message : 'Unknown error'
						return {
							content: [{ type: 'text' as const, text: message }],
							isError: true
						}
					}
				}
			)
		} else {
			// No input schema — register as zero-argument tool
			server.registerTool(tool.name, baseConfig, async () => {
				try {
					const fn = traverseCaller(caller, tool.procedurePath)
					const result = await fn()
					return {
						content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
					}
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : 'Unknown error'
					return {
						content: [{ type: 'text' as const, text: message }],
						isError: true
					}
				}
			})
		}
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined
	})

	await server.connect(transport)
	return transport.handleRequest(request)
}
