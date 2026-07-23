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

/** Σ(intensity × tierWeight) per muscle from one session's working sets. */
export function collectSessionMuscleFatigue(session: ReadinessSessionInput): Map<MuscleGroup, number> {
	const units = new Map<MuscleGroup, number>()
	for (const log of session.logs) {
		if (log.setType !== 'working') continue
		const tierWeight = FATIGUE_TIER_WEIGHTS[log.exercise.fatigueTier]
		for (const m of log.exercise.muscles) {
			if (m.intensity < REST_INTENSITY_THRESHOLD) continue
			units.set(m.muscleGroup, (units.get(m.muscleGroup) ?? 0) + m.intensity * tierWeight)
		}
	}
	return units
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
		for (const [muscleGroup, fatigueUnits] of collectSessionMuscleFatigue(session)) {
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

function templateMuscleGroups(template: ReadinessTemplateInput): Set<MuscleGroup> {
	const hit = new Set<MuscleGroup>()
	for (const we of template.exercises)
		for (const m of we.exercise.muscles) if (m.intensity >= REST_INTENSITY_THRESHOLD) hit.add(m.muscleGroup)
	return hit
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
	const pending: PendingMuscleRecovery[] = []
	for (const mg of templateMuscleGroups(template)) {
		const r = readiness.get(mg)
		if (r && r.readyAt > now) pending.push({ ...r, remainingHours: (r.readyAt - now) / HOUR_MS })
	}
	return pending.sort((a, b) => b.readyAt - a.readyAt)
}

/**
 * Rest before the next workout from the prior session's logged working sets only — same
 * overlap model as computeProgramRest (muscles hit in both prior session and next template),
 * so skipped exercises in the prior session don't inflate recovery demand.
 */
export function pendingRecoveryFromPriorSession(
	priorSession: ReadinessSessionInput | null,
	nextTemplate: ReadinessTemplateInput,
	now: number
): PendingMuscleRecovery[] {
	if (!priorSession) return []

	const trainedAt = priorSession.completedAt ?? priorSession.startedAt
	const priorFatigue = collectSessionMuscleFatigue(priorSession)
	const pending: PendingMuscleRecovery[] = []

	for (const mg of templateMuscleGroups(nextTemplate)) {
		const fatigueUnits = priorFatigue.get(mg)
		if (fatigueUnits === undefined) continue
		const requiredHours = recoveryHoursFromFatigue(fatigueUnits)
		const readyAt = trainedAt + requiredHours * HOUR_MS
		if (readyAt <= now) continue
		pending.push({
			muscleGroup: mg,
			trainedAt,
			fatigueUnits,
			requiredHours,
			readyAt,
			remainingHours: (readyAt - now) / HOUR_MS
		})
	}

	return pending.sort((a, b) => b.readyAt - a.readyAt)
}
