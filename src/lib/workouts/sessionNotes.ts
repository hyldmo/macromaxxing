import type { Exercise } from '@macromaxxing/db'

/**
 * Session notes are stored as a single free-text column (`workoutSessions.notes`),
 * but the timer-mode editor splits them into a note per exercise plus one general
 * note at the bottom. These helpers serialize that structure to/from the flat
 * string so storage stays unchanged.
 *
 * Format — markdown-ish headers, one section per exercise, general last:
 *
 *   ## Bench Press
 *   felt strong, add 2.5kg next time
 *
 *   ## Squat
 *   right knee twinge on set 3
 *
 *   ## Notes
 *   short on sleep today
 *
 * A header is only treated as an exercise section when its label exactly matches
 * one of the session's exercise names — so stray `## something` a user types stays
 * inside its note. Legacy free-text notes (no headers) round-trip into the general
 * note untouched.
 */

/** Reserved header label for the general (non-exercise) note. */
export const GENERAL_NOTES_LABEL = 'Notes'

export interface ParsedSessionNotes {
	/** Note text keyed by exercise name (trimmed, only non-empty entries present). */
	byExerciseName: Map<string, string>
	/** The general note (legacy free-text notes land here). */
	general: string
}

const HEADER_RE = /^##\s+(.+?)\s*$/

/** Split flat notes into per-exercise sections + general, keyed against known exercise names. */
export function parseSessionNotes(
	raw: string | null | undefined,
	exerciseNames: readonly string[]
): ParsedSessionNotes {
	const known = new Set(exerciseNames.map(n => n.trim()))
	const byExerciseName = new Map<string, string>()
	if (!raw || raw.trim().length === 0) return { byExerciseName, general: '' }

	// Content before the first recognized header and the reserved general section
	// both feed the general note — so old un-sectioned notes survive intact.
	const preamble: string[] = []
	const generalLines: string[] = []
	const exerciseLines = new Map<string, string[]>()
	let current = preamble

	for (const line of raw.split('\n')) {
		const match = line.match(HEADER_RE)
		if (match) {
			const label = match[1].trim()
			if (known.has(label)) {
				const buffer = exerciseLines.get(label) ?? []
				exerciseLines.set(label, buffer)
				current = buffer
				continue
			}
			if (label === GENERAL_NOTES_LABEL) {
				current = generalLines
				continue
			}
		}
		current.push(line)
	}

	for (const [name, lines] of exerciseLines) {
		const text = lines.join('\n').trim()
		if (text) byExerciseName.set(name, text)
	}

	const generalParts = [preamble.join('\n').trim(), generalLines.join('\n').trim()].filter(Boolean)
	return { byExerciseName, general: generalParts.join('\n\n') }
}

export interface NotesExercise {
	id: Exercise['id']
	name: string
}

/** Serialize per-exercise notes (keyed by id) + a general note back into the flat column. */
export function serializeSessionNotes(
	exercises: readonly NotesExercise[],
	notesByExerciseId: ReadonlyMap<Exercise['id'], string>,
	general: string
): string {
	const parts: string[] = []
	for (const ex of exercises) {
		const note = (notesByExerciseId.get(ex.id) ?? '').trim()
		if (note) parts.push(`## ${ex.name}\n${note}`)
	}
	const gen = general.trim()
	if (gen) parts.push(`## ${GENERAL_NOTES_LABEL}\n${gen}`)
	return parts.join('\n\n')
}
