/**
 * Local render fixture (not shipped). scripts/verify-widget.ts builds this with the same
 * Vite/Tailwind/React pipeline as the real widget and screenshots it, proving the app's
 * MuscleLoadPanel/BodyMap + HistoryChart render and style correctly inside a standalone bundle. The
 * live MCP handshake is exercised separately (in claude.ai).
 */
import { computeBalances, type MuscleGroup, type MuscleLoad, withZones } from '@macromaxxing/db'
import { createRoot } from 'react-dom/client'
import { ExerciseHistoryWidgetView } from './ExerciseHistoryWidgetView'
import { MuscleLoadWidgetView } from './MuscleLoadWidgetView'
import './widget.css'

const mk = (muscleGroup: MuscleGroup, workingSets: number): MuscleLoad => ({
	muscleGroup,
	workingSets,
	volumeKg: workingSets * 900,
	fatigueLoad: workingSets * 0.5,
	compoundSets: workingSets * 0.6,
	isolationSets: workingSets * 0.4,
	primarySets: workingSets * 0.8,
	secondarySets: workingSets * 0.2,
	incidentalSets: 0,
	strengthSets: 0,
	hypertrophySets: workingSets
})

// A realistic template load — quads (6 < MEV 8) and triceps (4 < MEV 6) fall below MEV so the
// zone-flag strip and body-map heat both light up in the screenshot.
const loads: MuscleLoad[] = [
	mk('chest', 12),
	mk('upper_back', 12),
	mk('lats', 14),
	mk('side_delts', 16),
	mk('rear_delts', 8),
	mk('front_delts', 4),
	mk('biceps', 10),
	mk('triceps', 4),
	mk('forearms', 4),
	mk('quads', 6),
	mk('hamstrings', 10),
	mk('glutes', 6),
	mk('calves', 10),
	mk('core', 8)
]

// A progressing e1RM series (fixed base timestamp — deterministic, no Date.now()).
const WEEK_MS = 7 * 86_400_000
const BASE_MS = 1_700_000_000_000
const e1rms = [92, 95, 94, 98, 101, 100, 104, 107, 106, 110]
const history = e1rms.map((e1rm, i) => ({
	sessionId: `wks_${i}`,
	startedAt: BASE_MS + i * WEEK_MS,
	e1rm,
	topSet: { weightKg: Math.round(e1rm * 0.85), reps: 5, rpe: 8 },
	volume: Math.round(e1rm * 0.85) * 5 * 3
}))

const el = document.getElementById('root')
if (el) {
	createRoot(el).render(
		<div className="space-y-6">
			<MuscleLoadWidgetView
				data={{
					title: 'Upper Maximalization',
					subtitle: 'hypertrophy · 8 exercises · 124 sets/wk',
					sex: 'male',
					muscles: withZones(loads),
					balances: computeBalances(loads),
					unitLabel: 'sets/wk'
				}}
			/>
			<ExerciseHistoryWidgetView data={{ title: 'Exercise progression', metric: 'e1rm', data: history }} />
		</div>
	)
}
