import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { inferRouterOutputs } from '@trpc/server'
import { WIDGET_HTML } from '../widgets/widgets.generated'
import type { AuthUser } from './auth'
import type { Database } from './db'
import { MCP_INSTRUCTIONS } from './mcp-instructions'
import { getTools, serializeToolResult } from './mcp-tools'
import { appRouter } from './router'

type RouterOutput = inferRouterOutputs<typeof appRouter>
type WorkoutMuscleLoadResult = RouterOutput['workout']['workoutMuscleLoad']
type ProgramMuscleLoadResult = RouterOutput['workout']['programMuscleLoad']
type ExerciseHistoryResult = RouterOutput['workout']['exerciseHistory']

/**
 * MCP Apps (ext-apps) interactive UI: a UI tool renders inline in claude.ai via ONE shared HTML
 * resource — the widget shell `ui://macromaxxing/widgets.html` (built from src/mcp-widgets/ by
 * scripts/build-widgets.ts, imported below as `WIDGET_HTML`). The server ships
 * `structuredContent { widget, data }`; the shell mounts the matching React view fed by that data —
 * the SAME MuscleLoadPanel/BodyMap the app renders, so the in-Claude preview can't drift.
 *
 * A UI tool gets `_meta.ui.resourceUri` (via `registerAppTool`) and returns `structuredContent`;
 * every other tool stays text-only — the model-facing `content[]` is the spec-required fallback, so
 * a host that can't render UI is unaffected. Adding a widget = one `UI_TOOLS` entry (widget id +
 * result→data mapper) + one variant in src/mcp-widgets/widget.tsx.
 */
const WIDGETS_UI = 'ui://macromaxxing/widgets.html'

/** workoutMuscleLoad result → MuscleLoadWidgetView data (src/mcp-widgets/MuscleLoadWidgetView.tsx). */
function mapWorkoutMuscleLoad(result: WorkoutMuscleLoadResult) {
	const { workout, totals } = result
	return {
		title: workout.name,
		subtitle: `${workout.trainingGoal} · ${workout.exerciseCount} exercises · ${totals.workingSets.toFixed(0)} sets/wk`,
		sex: result.sex,
		muscles: result.muscles,
		balances: result.balances,
		unitLabel: 'sets/wk'
	}
}

/** programMuscleLoad result → the same MuscleLoadWidgetView, aggregated across the program cycle. */
function mapProgramMuscleLoad(result: ProgramMuscleLoadResult) {
	const { program, totals } = result
	return {
		title: program.name,
		subtitle: `${program.workoutCount} workouts · ${program.exerciseCount} exercises · ${totals.workingSets.toFixed(0)} sets/cycle`,
		sex: result.sex,
		muscles: result.muscles,
		balances: result.balances,
		unitLabel: 'sets/cycle'
	}
}

/** exerciseHistory result (bare per-session series) → ExerciseHistoryWidgetView data. */
function mapExerciseHistory(result: ExerciseHistoryResult) {
	return {
		title: 'Exercise progression',
		metric: 'e1rm',
		data: result.map(s => ({
			sessionId: s.sessionId,
			startedAt: s.startedAt,
			e1rm: s.e1rm,
			topSet: s.topSet,
			volume: s.volume
		}))
	}
}

/** tool name → { widget id the shell renders, mapper from tool result → that widget's data }. */
const UI_TOOLS: Record<string, { widget: string; map: (result: any) => unknown }> = {
	workout_workoutMuscleLoad: { widget: 'muscleLoad', map: mapWorkoutMuscleLoad },
	workout_programMuscleLoad: { widget: 'muscleLoad', map: mapProgramMuscleLoad },
	workout_exerciseHistory: { widget: 'exerciseHistory', map: mapExerciseHistory }
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
		{ jsonSchemaValidator: new CfWorkerJsonSchemaValidator(), instructions: MCP_INSTRUCTIONS }
	)

	const caller = appRouter.createCaller({ db, user, env })

	// One resource serves every UI tool; the host fetches it via `resources/read` when it renders a
	// UI tool. Registered per-request (cheap) on the stateless server.
	registerAppResource(server, 'Macromaxxing widgets', WIDGETS_UI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
		contents: [{ uri: WIDGETS_UI, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML }]
	}))

	const tools = getTools()
	for (const tool of tools) {
		const ui = UI_TOOLS[tool.name]
		// UI tools also ship `structuredContent { widget, data }` — the widget renders from it (never content[]).
		const toResult = (result: unknown) => {
			const base = { content: [{ type: 'text' as const, text: serializeToolResult(result) }] }
			return ui ? { ...base, structuredContent: { widget: ui.widget, data: ui.map(result) } } : base
		}
		const baseConfig = { description: tool.description, annotations: tool.annotations }

		if (tool.zodSchema) {
			// Pass the raw Zod schema — the MCP SDK converts to JSON Schema internally
			const config = { ...baseConfig, inputSchema: tool.zodSchema as any }
			const handler = async (args: Record<string, unknown>) => {
				try {
					const fn = traverseCaller(caller, tool.procedurePath)
					return toResult(await fn(args))
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : 'Unknown error'
					return { content: [{ type: 'text' as const, text: message }], isError: true }
				}
			}
			if (ui) {
				registerAppTool(server, tool.name, { ...config, _meta: { ui: { resourceUri: WIDGETS_UI } } }, handler)
			} else {
				server.registerTool(tool.name, config, handler)
			}
		} else {
			// No input schema — register as zero-argument tool
			server.registerTool(tool.name, baseConfig, async () => {
				try {
					const fn = traverseCaller(caller, tool.procedurePath)
					return toResult(await fn())
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : 'Unknown error'
					return { content: [{ type: 'text' as const, text: message }], isError: true }
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
