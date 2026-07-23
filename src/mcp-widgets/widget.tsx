import { App } from '@modelcontextprotocol/ext-apps'
import { createRoot } from 'react-dom/client'
import { type ExerciseHistoryWidgetData, ExerciseHistoryWidgetView } from './ExerciseHistoryWidgetView'
import { type MuscleLoadWidgetData, MuscleLoadWidgetView } from './MuscleLoadWidgetView'
import './widget.css'

/**
 * MCP Apps widget shell (the `ui://macromaxxing/widgets.html` resource, built by
 * scripts/build-widgets.ts). Boots the ext-apps `App`, receives the tool result the host delivers
 * via `structuredContent { widget, data }` (server side: `UI_TOOLS` in workers/functions/lib/mcp.ts),
 * and mounts the matching view. Adding a widget = one `WidgetPayload` variant + one branch here.
 *
 * No theme handling: macromaxxing is dark-only, and widget.css paints the app's dark surface so the
 * card stays readable whether Claude renders it on a light or dark chat surface.
 */
type WidgetPayload =
	| { widget: 'muscleLoad'; data: MuscleLoadWidgetData }
	| { widget: 'exerciseHistory'; data: ExerciseHistoryWidgetData }

function isWidgetPayload(value: unknown): value is WidgetPayload {
	if (typeof value !== 'object' || value === null || !('widget' in value)) return false
	return value.widget === 'muscleLoad' || value.widget === 'exerciseHistory'
}

const container = document.getElementById('root')
const root = container ? createRoot(container) : null
let payload: WidgetPayload | null = null

function render() {
	if (!payload) {
		root?.render(null)
		return
	}
	root?.render(
		payload.widget === 'muscleLoad' ? (
			<MuscleLoadWidgetView data={payload.data} />
		) : (
			<ExerciseHistoryWidgetView data={payload.data} />
		)
	)
}

const app = new App({ name: 'macromaxxing-widgets', version: '1.0.0' })

app.ontoolresult = params => {
	payload = isWidgetPayload(params.structuredContent) ? params.structuredContent : null
	render()
}

app.connect()
	.then(render)
	.catch((error: unknown) => {
		if (container) {
			container.textContent = `widget connect failed: ${error instanceof Error ? error.message : String(error)}`
		}
	})
