import { type ExerciseType, type FatigueTier, MUSCLE_GROUPS, type MuscleGroup, type TrainingGoal } from './custom-types'

/**
 * Relative CNS/systemic drain per fatigue tier. Tier 1 (heavy barbell compounds)
 * taxes the body ~4x more than tier 4 (cable isolations). Used to roll up a
 * single "fatigue load" number per muscle or per session.
 */
export const FATIGUE_TIER_WEIGHTS: Record<FatigueTier, number> = {
	1: 1.0,
	2: 0.75,
	3: 0.5,
	4: 0.25
}

export type IntensityBucket = 'primary' | 'secondary' | 'incidental'

/** Bucket an exercise→muscle intensity into primary/secondary/incidental. */
export function classifyIntensity(intensity: number): IntensityBucket {
	if (intensity >= 0.8) return 'primary'
	if (intensity >= 0.3) return 'secondary'
	return 'incidental'
}

export type VolumeZone = 'below_mev' | 'mev' | 'mav' | 'mrv' | 'above_mrv'

export interface VolumeLandmark {
	mev: number
	mav: number
	mrv: number
}

/**
 * Per-muscle weekly working-set landmarks (Renaissance Periodization style).
 * MEV = minimum effective volume, MAV = upper end of adaptive volume,
 * MRV = maximum recoverable volume. Used to classify a weekly volume into
 * a training zone. Values are rough defaults — forearms/glutes/core left low
 * since they're usually hit indirectly.
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmark> = {
	chest: { mev: 8, mav: 16, mrv: 22 },
	upper_back: { mev: 8, mav: 18, mrv: 25 },
	lats: { mev: 8, mav: 18, mrv: 25 },
	front_delts: { mev: 0, mav: 6, mrv: 12 },
	side_delts: { mev: 8, mav: 18, mrv: 26 },
	rear_delts: { mev: 6, mav: 14, mrv: 24 },
	biceps: { mev: 8, mav: 16, mrv: 26 },
	triceps: { mev: 6, mav: 12, mrv: 18 },
	forearms: { mev: 2, mav: 6, mrv: 10 },
	quads: { mev: 8, mav: 14, mrv: 20 },
	hamstrings: { mev: 6, mav: 12, mrv: 20 },
	glutes: { mev: 0, mav: 8, mrv: 16 },
	calves: { mev: 8, mav: 14, mrv: 20 },
	core: { mev: 0, mav: 12, mrv: 25 }
}

export function classifyZone(weeklySets: number, landmark: VolumeLandmark): VolumeZone {
	if (weeklySets < landmark.mev) return 'below_mev'
	if (weeklySets < landmark.mav) return 'mev'
	if (weeklySets < landmark.mrv) return 'mav'
	if (weeklySets <= landmark.mrv) return 'mrv'
	return 'above_mrv'
}

/**
 * A single exercise→muscle contribution within a workout or session.
 * One row per (exercise instance × muscle). Callers pre-resolve sets/reps/weight.
 */
export interface MuscleContribution {
	muscleGroup: MuscleGroup
	intensity: number
	sets: number
	/** Reps per set; omit for template-only (no working weight yet). */
	reps?: number
	/** Working weight per set in kg; omit for template-only. */
	weightKg?: number
	exerciseType: ExerciseType
	fatigueTier: FatigueTier
	/** Per-exercise training goal if overridden, else parent (workout/session) goal. */
	trainingGoal: TrainingGoal
}

export interface MuscleLoad {
	muscleGroup: MuscleGroup
	/** Σ(sets × intensity). The canonical "effective sets" number. */
	workingSets: number
	/** Σ(weight × reps × sets × intensity) in kg·reps. Zero if no weight data. */
	volumeKg: number
	/** Σ(sets × intensity × tierWeight). Proxy for CNS / systemic drain. */
	fatigueLoad: number
	compoundSets: number
	isolationSets: number
	primarySets: number
	secondarySets: number
	incidentalSets: number
	strengthSets: number
	hypertrophySets: number
}

function emptyLoad(muscleGroup: MuscleGroup): MuscleLoad {
	return {
		muscleGroup,
		workingSets: 0,
		volumeKg: 0,
		fatigueLoad: 0,
		compoundSets: 0,
		isolationSets: 0,
		primarySets: 0,
		secondarySets: 0,
		incidentalSets: 0,
		strengthSets: 0,
		hypertrophySets: 0
	}
}

/**
 * Aggregate muscle contributions into a full per-muscle breakdown. Returns one
 * entry per muscle group in MUSCLE_GROUPS order (including zeros) so UIs can
 * render a stable table.
 */
export function computeMuscleLoad(contributions: readonly MuscleContribution[]): MuscleLoad[] {
	const byMuscle = new Map<MuscleGroup, MuscleLoad>()
	for (const mg of MUSCLE_GROUPS) byMuscle.set(mg, emptyLoad(mg))

	for (const c of contributions) {
		const load = byMuscle.get(c.muscleGroup)
		if (!load) continue
		const effectiveSets = c.sets * c.intensity
		load.workingSets += effectiveSets
		load.fatigueLoad += effectiveSets * FATIGUE_TIER_WEIGHTS[c.fatigueTier]
		if (c.reps != null && c.weightKg != null) {
			load.volumeKg += c.weightKg * c.reps * c.sets * c.intensity
		}
		if (c.exerciseType === 'compound') load.compoundSets += effectiveSets
		else load.isolationSets += effectiveSets
		const bucket = classifyIntensity(c.intensity)
		if (bucket === 'primary') load.primarySets += effectiveSets
		else if (bucket === 'secondary') load.secondarySets += effectiveSets
		else load.incidentalSets += effectiveSets
		if (c.trainingGoal === 'strength') load.strengthSets += effectiveSets
		else load.hypertrophySets += effectiveSets
	}

	return Array.from(byMuscle.values())
}

export interface MuscleLoadWithZone extends MuscleLoad {
	zone: VolumeZone
	landmark: VolumeLandmark
}

/** Attach a training-zone classification to each muscle using the default landmarks. */
export function withZones(loads: readonly MuscleLoad[]): MuscleLoadWithZone[] {
	return loads.map(l => ({
		...l,
		landmark: VOLUME_LANDMARKS[l.muscleGroup],
		zone: classifyZone(l.workingSets, VOLUME_LANDMARKS[l.muscleGroup])
	}))
}

export interface BalanceRatio {
	name: string
	numerator: number
	denominator: number
	/** numerator / denominator; null if denominator == 0. */
	ratio: number | null
	/** Suggested target range the ratio should fall into. */
	idealMin: number
	idealMax: number
	numeratorMuscles: readonly MuscleGroup[]
	denominatorMuscles: readonly MuscleGroup[]
}

interface BalanceDef {
	name: string
	numerator: readonly MuscleGroup[]
	denominator: readonly MuscleGroup[]
	idealMin: number
	idealMax: number
}

const BALANCE_DEFS: readonly BalanceDef[] = [
	{
		name: 'push_pull',
		numerator: ['chest', 'front_delts', 'triceps'],
		denominator: ['upper_back', 'lats', 'biceps'],
		idealMin: 0.8,
		idealMax: 1.2
	},
	{
		name: 'quad_hamstring',
		numerator: ['quads'],
		denominator: ['hamstrings'],
		idealMin: 0.8,
		idealMax: 1.5
	},
	{
		name: 'front_rear_delt',
		numerator: ['front_delts'],
		denominator: ['rear_delts'],
		idealMin: 0.5,
		idealMax: 1.0
	},
	{
		name: 'biceps_triceps',
		numerator: ['biceps'],
		denominator: ['triceps'],
		idealMin: 0.7,
		idealMax: 1.2
	},
	{
		name: 'anterior_posterior',
		numerator: ['chest', 'front_delts', 'quads'],
		denominator: ['upper_back', 'lats', 'rear_delts', 'hamstrings', 'glutes'],
		idealMin: 0.8,
		idealMax: 1.2
	}
] as const

export function computeBalances(loads: readonly MuscleLoad[]): BalanceRatio[] {
	const sets = new Map(loads.map(l => [l.muscleGroup, l.workingSets]))
	const sum = (groups: readonly MuscleGroup[]) => groups.reduce((s, g) => s + (sets.get(g) ?? 0), 0)

	return BALANCE_DEFS.map(def => {
		const numerator = sum(def.numerator)
		const denominator = sum(def.denominator)
		return {
			name: def.name,
			numerator,
			denominator,
			ratio: denominator > 0 ? numerator / denominator : null,
			idealMin: def.idealMin,
			idealMax: def.idealMax,
			numeratorMuscles: def.numerator,
			denominatorMuscles: def.denominator
		}
	})
}

/** Rolled-up totals across all muscles. Convenient summary for an MCP reply. */
export interface MuscleLoadTotals {
	workingSets: number
	volumeKg: number
	fatigueLoad: number
	compoundSets: number
	isolationSets: number
	primarySets: number
	secondarySets: number
	incidentalSets: number
	strengthSets: number
	hypertrophySets: number
	musclesTrained: number
}

export function sumTotals(loads: readonly MuscleLoad[]): MuscleLoadTotals {
	const totals: MuscleLoadTotals = {
		workingSets: 0,
		volumeKg: 0,
		fatigueLoad: 0,
		compoundSets: 0,
		isolationSets: 0,
		primarySets: 0,
		secondarySets: 0,
		incidentalSets: 0,
		strengthSets: 0,
		hypertrophySets: 0,
		musclesTrained: 0
	}
	for (const l of loads) {
		totals.workingSets += l.workingSets
		totals.volumeKg += l.volumeKg
		totals.fatigueLoad += l.fatigueLoad
		totals.compoundSets += l.compoundSets
		totals.isolationSets += l.isolationSets
		totals.primarySets += l.primarySets
		totals.secondarySets += l.secondarySets
		totals.incidentalSets += l.incidentalSets
		totals.strengthSets += l.strengthSets
		totals.hypertrophySets += l.hypertrophySets
		if (l.workingSets > 0) totals.musclesTrained += 1
	}
	return totals
}
