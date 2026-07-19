import type { MuscleGroup } from '@macromaxxing/db'
import type { FC } from 'react'
import { cn } from '~/lib'
import { classifyRecovery, type RecoveryBucket } from '~/lib/workouts/programRest'

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
	chest: 'chest',
	upper_back: 'upper bk',
	lats: 'lats',
	front_delts: 'fr. delt',
	side_delts: 'sd. delt',
	rear_delts: 'rr. delt',
	biceps: 'biceps',
	triceps: 'triceps',
	forearms: 'forearm',
	quads: 'quads',
	hamstrings: 'hams',
	glutes: 'glutes',
	calves: 'calves',
	core: 'core'
}

const RECOVERY_TONES: Record<RecoveryBucket, string> = {
	fresh: 'border-success/50 bg-success/10 text-success',
	moderate: 'border-amber-500/60 bg-amber-500/15 text-amber-500',
	heavy: 'border-destructive/60 bg-destructive/15 text-destructive'
}

export interface MuscleRestChipProps {
	muscleGroup: MuscleGroup
	/** Hours of rest the prior workout's stimulus requires before re-hitting this muscle. */
	hours: number
}

export const MuscleRestChip: FC<MuscleRestChipProps> = ({ muscleGroup, hours }) => {
	const bucket = classifyRecovery(hours)
	const label = muscleGroup.replace('_', ' ')
	return (
		<span
			className={cn(
				'inline-flex items-baseline gap-1 border px-1 py-px font-mono text-[10px] tabular-nums',
				RECOVERY_TONES[bucket]
			)}
			title={`${label}: ${hours}h recovery before next workout`}
		>
			<span>{MUSCLE_LABELS[muscleGroup]}</span>
			<span className="text-[9px] opacity-70">{hours}h</span>
		</span>
	)
}

export interface MuscleReadinessChipProps {
	muscleGroup: MuscleGroup
	/** Hours until the muscle is recovered. Always > 0 — recovered muscles render no chip. */
	remainingHours: number
	/** Epoch ms when the muscle is recovered. */
	readyAt: number
}

/** Advisory chip: this muscle is still inside its recovery window from a recent session. */
export const MuscleReadinessChip: FC<MuscleReadinessChipProps> = ({ muscleGroup, remainingHours, readyAt }) => {
	const tone = remainingHours > 24 ? RECOVERY_TONES.heavy : RECOVERY_TONES.moderate
	const label = muscleGroup.replace('_', ' ')
	const readyLabel = new Date(readyAt).toLocaleString(undefined, {
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit'
	})
	return (
		<span
			className={cn(
				'inline-flex items-baseline gap-1 border px-1 py-px font-mono text-[10px] tabular-nums',
				tone
			)}
			title={`${label}: recovered ~${readyLabel}`}
		>
			<span>{MUSCLE_LABELS[muscleGroup]}</span>
			<span className="text-[9px] opacity-70">~{Math.ceil(remainingHours)}h</span>
		</span>
	)
}

export interface MuscleVolumeChipProps {
	muscleGroup: MuscleGroup
	/** Effective sets — drives opacity. */
	effectiveSets: number
	/** Max effective sets across siblings — normalizes opacity. */
	maxSets: number
}

export const MuscleVolumeChip: FC<MuscleVolumeChipProps> = ({ muscleGroup, effectiveSets, maxSets }) => {
	const t = maxSets > 0 ? Math.min(1, effectiveSets / maxSets) : 0
	// Opacity floor at 0.45 so even small contributors stay legible.
	const opacity = 0.45 + 0.55 * t
	return (
		<span
			className="inline-flex items-baseline border border-edge bg-surface-2 px-1 py-px font-mono text-[10px] text-ink-muted tabular-nums"
			style={{ opacity }}
			title={`${muscleGroup.replace('_', ' ')}: ${effectiveSets.toFixed(1)} effective sets`}
		>
			{MUSCLE_LABELS[muscleGroup]}
		</span>
	)
}
