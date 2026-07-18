import type { Exercise } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import { GENERAL_NOTES_LABEL, type NotesExercise, parseSessionNotes, serializeSessionNotes } from './sessionNotes'

const ex = (id: string, name: string): NotesExercise => ({ id: id as Exercise['id'], name })

describe('parseSessionNotes', () => {
	it('returns empty for null/blank input', () => {
		expect(parseSessionNotes(null, ['Bench Press']).general).toBe('')
		expect(parseSessionNotes('   \n  ', ['Bench Press']).byExerciseName.size).toBe(0)
	})

	it('routes legacy un-sectioned notes to the general note', () => {
		const parsed = parseSessionNotes('felt tired today\nslept badly', ['Bench Press'])
		expect(parsed.general).toBe('felt tired today\nslept badly')
		expect(parsed.byExerciseName.size).toBe(0)
	})

	it('splits recognized exercise headers into sections', () => {
		const raw = '## Bench Press\nstrong\n\n## Squat\nknee twinge\n\n## Notes\nlow sleep'
		const parsed = parseSessionNotes(raw, ['Bench Press', 'Squat'])
		expect(parsed.byExerciseName.get('Bench Press')).toBe('strong')
		expect(parsed.byExerciseName.get('Squat')).toBe('knee twinge')
		expect(parsed.general).toBe('low sleep')
	})

	it('keeps unknown headers as ordinary note content', () => {
		const raw = '## Bench Press\nnote line\n## Not An Exercise\nstill bench'
		const parsed = parseSessionNotes(raw, ['Bench Press'])
		expect(parsed.byExerciseName.get('Bench Press')).toBe('note line\n## Not An Exercise\nstill bench')
	})

	it('merges preamble and reserved general section', () => {
		const raw = 'top line\n\n## Bench Press\nx\n\n## Notes\nbottom line'
		const parsed = parseSessionNotes(raw, ['Bench Press'])
		expect(parsed.general).toBe('top line\n\nbottom line')
	})
})

describe('serializeSessionNotes', () => {
	const exercises = [ex('exc_a', 'Bench Press'), ex('exc_b', 'Squat')]

	it('emits a section per non-empty exercise note plus general last', () => {
		const notes = new Map<Exercise['id'], string>([
			['exc_a' as Exercise['id'], 'strong'],
			['exc_b' as Exercise['id'], 'knee twinge']
		])
		const out = serializeSessionNotes(exercises, notes, 'low sleep')
		expect(out).toBe(`## Bench Press\nstrong\n\n## Squat\nknee twinge\n\n## ${GENERAL_NOTES_LABEL}\nlow sleep`)
	})

	it('skips empty sections', () => {
		const notes = new Map<Exercise['id'], string>([['exc_b' as Exercise['id'], 'only squat']])
		expect(serializeSessionNotes(exercises, notes, '')).toBe('## Squat\nonly squat')
	})

	it('returns empty string when everything is blank', () => {
		expect(serializeSessionNotes(exercises, new Map(), '   ')).toBe('')
	})
})

describe('round-trip', () => {
	it('serialize → parse preserves per-exercise and general notes', () => {
		const exercises = [ex('exc_a', 'Bench Press'), ex('exc_b', 'Overhead Press')]
		const notes = new Map<Exercise['id'], string>([
			['exc_a' as Exercise['id'], 'multi\nline note'],
			['exc_b' as Exercise['id'], 'ok']
		])
		const serialized = serializeSessionNotes(exercises, notes, 'general stuff')
		const parsed = parseSessionNotes(serialized, ['Bench Press', 'Overhead Press'])
		expect(parsed.byExerciseName.get('Bench Press')).toBe('multi\nline note')
		expect(parsed.byExerciseName.get('Overhead Press')).toBe('ok')
		expect(parsed.general).toBe('general stuff')
	})
})
