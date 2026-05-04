import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { AnyRouter } from '@trpc/server'
import type { AuthUser } from './auth'
import type { Database } from './db'
import { appRouter } from './router'

export function procedurePathToToolName(path: string): string {
	return path.replaceAll('.', '_')
}

interface McpToolDef {
	name: string
	description: string
	/** The raw Zod schema from tRPC's .input(), or undefined for no-input procedures */
	zodSchema: unknown
	procedurePath: string
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

		tools.push({
			name: procedurePathToToolName(path),
			description: meta.description,
			zodSchema,
			procedurePath: path
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
		if (tool.zodSchema) {
			// Pass the raw Zod schema — the MCP SDK converts to JSON Schema internally
			server.registerTool(
				tool.name,
				{ description: tool.description, inputSchema: tool.zodSchema as any },
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
			server.registerTool(tool.name, { description: tool.description }, async () => {
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
