import type { FC } from 'react'
import {
	HistoryChart,
	type HistoryChartDatum,
	type HistoryChartMetric
} from '~/features/exercises/components/HistoryChart'
import { METRIC_LABEL } from '~/lib/workouts/constants'

/**
 * The `structuredContent.data` `workout_exerciseHistory` ships to this widget (see `UI_TOOLS` in
 * workers/functions/lib/mcp.ts). The tool returns a bare per-session series with no exercise name, so
 * the mapper passes a generic `title` and the metric; the header's session count is derived here.
 */
export interface ExerciseHistoryWidgetData {
	title: string
	metric: HistoryChartMetric
	data: HistoryChartDatum[]
}

/**
 * Presentational body of the exercise-history MCP Apps widget: the app's `HistoryChart` (hover
 * tooltip + PR markers come for free) under a header. Same component the exercise detail page
 * renders, so the in-Claude progression chart can't drift from the app. No ext-apps bootstrap so
 * the render fixture can mount it.
 */
export const ExerciseHistoryWidgetView: FC<{ data: ExerciseHistoryWidgetData }> = ({ data }) => (
	<div className="mx-auto max-w-lg space-y-2">
		<div className="space-y-0.5">
			<div className="font-medium text-ink text-sm">{data.title}</div>
			<div className="font-mono text-ink-faint text-xs tabular-nums">
				{METRIC_LABEL[data.metric]} · {data.data.length} {data.data.length === 1 ? 'session' : 'sessions'}
			</div>
		</div>
		{data.data.length > 0 ? (
			<HistoryChart data={data.data} metric={data.metric} />
		) : (
			<div className="rounded-md border border-edge p-6 text-center font-mono text-ink-faint text-xs">
				No logged sessions in this window.
			</div>
		)}
	</div>
)
