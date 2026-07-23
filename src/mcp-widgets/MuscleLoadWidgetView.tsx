import type { BalanceRatio, MuscleLoadWithZone, Sex } from '@macromaxxing/db'
import type { FC } from 'react'
import { MuscleLoadPanel } from '~/features/workouts/components/MuscleLoadPanel'

/**
 * The `structuredContent.data` a muscle-load MCP tool ships to this widget (see `UI_TOOLS` in
 * workers/functions/lib/mcp.ts). Shared by `workout_workoutMuscleLoad` (weekly, one template) and
 * `workout_programMuscleLoad` (per cycle) — the mapper composes `title`/`subtitle`/`unitLabel` so
 * this view stays scope-agnostic. Server-controlled shape, kept in sync by hand across the two build
 * graphs — `workers/` can't import `src/`, so there's no compile-time link between mapper and view.
 */
export interface MuscleLoadWidgetData {
	title: string
	subtitle: string
	sex: Sex
	muscles: MuscleLoadWithZone[]
	balances: BalanceRatio[]
	/** Volume unit for the body-map tooltip: 'sets/wk' (template) or 'sets/cycle' (program). */
	unitLabel: string
}

/**
 * Presentational body of the muscle-load MCP Apps widget: a header (title + subtitle), a
 * MEV/MAV/MRV zone-flag strip (the "does this clear MEV / is anything over MRV" answer the agent is
 * usually validating), and the shared `MuscleLoadPanel` (interactive BodyMap + balance bars) — the
 * same component the in-app program sidebar renders, so the in-Claude preview can't drift from the
 * app. Kept free of the ext-apps bootstrap so the render fixture can mount it.
 */
export const MuscleLoadWidgetView: FC<{ data: MuscleLoadWidgetData }> = ({ data }) => {
	const { title, subtitle, muscles, balances, sex, unitLabel } = data
	const belowMev = muscles
		.filter(m => m.zone === 'below_mev' && m.landmark.mev > 0)
		.map(m => m.muscleGroup.replace('_', ' '))
	const overMrv = muscles.filter(m => m.zone === 'above_mrv').map(m => m.muscleGroup.replace('_', ' '))

	return (
		<div className="mx-auto max-w-md space-y-2">
			<div className="space-y-0.5">
				<div className="font-medium text-ink text-sm">{title}</div>
				<div className="font-mono text-ink-faint text-xs tabular-nums">{subtitle}</div>
			</div>
			{(belowMev.length > 0 || overMrv.length > 0) && (
				<div className="space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 font-mono text-[11px] tabular-nums">
					{belowMev.length > 0 && (
						<div>
							<span className="text-amber-500">below MEV:</span>{' '}
							<span className="text-ink-muted">{belowMev.join(', ')}</span>
						</div>
					)}
					{overMrv.length > 0 && (
						<div>
							<span className="text-red-500">over MRV:</span>{' '}
							<span className="text-ink-muted">{overMrv.join(', ')}</span>
						</div>
					)}
				</div>
			)}
			<MuscleLoadPanel muscles={muscles} balances={balances} sex={sex} unitLabel={unitLabel} />
		</div>
	)
}
