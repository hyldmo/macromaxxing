import { FATIGUE_TIER_WEIGHTS, type FatigueTier, type MuscleGroup, type SetType } from '@macromaxxing/db'
import { REST_INTENSITY_THRESHOLD, recoveryHoursFromFatigue } from './programRest'

const HOUR_MS = 3_600_000

/** Minimal session shape needed for readiness — structurally compatible with
 * `RouterOutput['dashboard']['summary']['sessions'][number]` but narrowed to fields actually used. */
export interface ReadinessSessionInput {
	startedAt: number
	completedAt: number | null
	logs: ReadonlyArray<{
		setType: SetType
		exercise: {
			fatigueTier: FatigueTier
			muscles: ReadonlyArray<{ muscleGroup: MuscleGroup; intensity: number }>
		}
	}>
}

export interface MuscleReadiness {
	muscleGroup: MuscleGroup
	/** End of the most recent session that trained this muscle (completedAt, or startedAt while in progress). */
	trainedAt: number
	/** Σ(intensity × tierWeight) over that session's working sets hitting this muscle. */
	fatigueUnits: number
	/** Recovery window the stimulus demands (recoveryHoursFromFatigue). */
	requiredHours: number
	/** Epoch ms when the muscle is recovered: trainedAt + requiredHours. */
	readyAt: number
}

/**
 * Per-muscle recovery state from recent logged sessions. For each muscle, only the most
 * recent session with ≥1 working set hitting it (intensity ≥ threshold) counts — the same
 * single-session model as computeProgramRest, but from actual logs instead of template
 * targets, so a cut-short session correctly demands less recovery than the plan would.
 * In-progress sessions count too, anchored at startedAt.
 */
export function computeMuscleReadiness(sessions: readonly ReadinessSessionInput[]): Map<MuscleGroup, MuscleReadiness> {
	const byMuscle = new Map<MuscleGroup, MuscleReadiness>()
	const ordered = [...sessions].sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))
	for (const session of ordered) {
		const trainedAt = session.completedAt ?? session.startedAt
		const units = new Map<MuscleGroup, number>()
		for (const log of session.logs) {
			if (log.setType !== 'working') continue
			const tierWeight = FATIGUE_TIER_WEIGHTS[log.exercise.fatigueTier]
			for (const m of log.exercise.muscles) {
				if (m.intensity < REST_INTENSITY_THRESHOLD) continue
				units.set(m.muscleGroup, (units.get(m.muscleGroup) ?? 0) + m.intensity * tierWeight)
			}
		}
		for (const [muscleGroup, fatigueUnits] of units) {
			if (byMuscle.has(muscleGroup)) continue
			const requiredHours = recoveryHoursFromFatigue(fatigueUnits)
			byMuscle.set(muscleGroup, {
				muscleGroup,
				trainedAt,
				fatigueUnits,
				requiredHours,
				readyAt: trainedAt + requiredHours * HOUR_MS
			})
		}
	}
	return byMuscle
}

/** Minimal template shape — which muscles the upcoming workout trains. */
export interface ReadinessTemplateInput {
	exercises: ReadonlyArray<{
		exercise: { muscles: ReadonlyArray<{ muscleGroup: MuscleGroup; intensity: number }> }
	}>
}

export interface PendingMuscleRecovery extends MuscleReadiness {
	/** Hours until readyAt, measured from `now`. Always > 0. */
	remainingHours: number
}

/**
 * Muscles the upcoming workout trains (intensity ≥ threshold) that are still inside their
 * recovery window at `now`, most-binding first. Empty when everything is recovered.
 */
export function pendingRecovery(
	template: ReadinessTemplateInput,
	readiness: ReadonlyMap<MuscleGroup, MuscleReadiness>,
	now: number
): PendingMuscleRecovery[] {
	const hit = new Set<MuscleGroup>()
	for (const we of template.exercises)
		for (const m of we.exercise.muscles) if (m.intensity >= REST_INTENSITY_THRESHOLD) hit.add(m.muscleGroup)
	const pending: PendingMuscleRecovery[] = []
	for (const mg of hit) {
		const r = readiness.get(mg)
		if (r && r.readyAt > now) pending.push({ ...r, remainingHours: (r.readyAt - now) / HOUR_MS })
	}
	return pending.sort((a, b) => b.readyAt - a.readyAt)
}
