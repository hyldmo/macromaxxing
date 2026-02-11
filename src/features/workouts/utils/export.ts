import type { RouterOutput } from '~/lib/trpc'

type Session = RouterOutput['workout']['getSession']
type SessionLog = Session['logs'][number]

/** Format a workout session as LLM-friendly markdown */
export function formatSession(session: Session): string {
	const lines: string[] = []

	lines.push(`# ${session.name ?? 'Workout Session'}`)
	lines.push(
		`Date: ${new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
	)

	if (session.completedAt) {
		const mins = Math.round((session.completedAt - session.startedAt) / 60000)
		lines.push(`Duration: ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}`)
	}

	const vol = session.logs.reduce((s, l) => s + l.weightKg * l.reps, 0)
	lines.push(`Sets: ${session.logs.length} | Volume: ${(vol / 1000).toFixed(1)}k kg`)
	if (session.notes) lines.push(`Notes: ${session.notes}`)
	lines.push('')

	// Group logs by exercise, preserving order of first appearance
	const groups: Array<{ exercise: SessionLog['exercise']; logs: SessionLog[] }> = []
	const seen = new Map<string, number>()

	for (const log of session.logs) {
		const idx = seen.get(log.exerciseId)
		if (idx !== undefined) {
			groups[idx].logs.push(log)
		} else {
			seen.set(log.exerciseId, groups.length)
			groups.push({ exercise: log.exercise, logs: [log] })
		}
	}

	for (const { exercise, logs } of groups) {
		lines.push(`## ${exercise.name}`)
		for (const log of logs) {
			const parts = [`${log.setNumber}.`]
			if (log.setType !== 'working') parts.push(`[${log.setType}]`)
			parts.push(`${log.weightKg}kg × ${log.reps}`)
			if (log.rpe != null) parts.push(`RPE ${log.rpe}`)
			if (log.failureFlag) parts.push('(failure)')
			lines.push(parts.join(' '))
		}
		lines.push('')
	}

	return lines.join('\n').trimEnd()
}

type Workout = RouterOutput['workout']['getWorkout']

/** Format a workout template as LLM-friendly markdown */
export function formatTemplate(workout: Workout): string {
	const lines: string[] = []

	lines.push(`# ${workout.name}`)
	lines.push(`Training goal: ${workout.trainingGoal}`)
	lines.push('')
	lines.push('## Exercises')

	// Track superset groups for labeling
	const groupIds = [...new Set(workout.exercises.map(e => e.supersetGroup).filter((g): g is number => g !== null))]

	for (let i = 0; i < workout.exercises.length; i++) {
		const we = workout.exercises[i]
		const parts: string[] = []

		// Exercise name and type
		parts.push(`${i + 1}. ${we.exercise.name} (${we.exercise.type})`)

		// Target sets × reps @ weight
		const sets = we.targetSets ?? '?'
		const reps = we.targetReps ?? '?'
		let prescription = `${sets}×${reps}`
		if (we.targetWeight != null) prescription += ` @ ${we.targetWeight}kg`
		parts.push(`— ${prescription}`)

		// Set mode
		if (we.setMode && we.setMode !== 'working') {
			parts.push(`[${we.setMode}]`)
		}

		lines.push(parts.join(' '))

		// Superset annotation
		if (we.supersetGroup !== null) {
			const label = groupIds.indexOf(we.supersetGroup) + 1
			lines.push(`   ↳ Superset ${label}`)
		}
	}

	return lines.join('\n').trimEnd()
}
