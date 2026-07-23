import type { TypeIDString } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import { type ActiveProgramRef, type ProgramCycleSession, pickNextWorkout } from './programCycle'

const wkt = (n: string): TypeIDString<'wkt'> => `wkt_${n}` as TypeIDString<'wkt'>
const wpr = (n: string): TypeIDString<'wpr'> => `wpr_${n}` as TypeIDString<'wpr'>

const tpl = (id: string) => ({ id: wkt(id) })
const completed = (workoutId: string, completedAt: number): ProgramCycleSession => ({
	workoutId: wkt(workoutId),
	completedAt
})

describe('pickNextWorkout', () => {
	describe('legacy mode (no active program)', () => {
		it('returns null when there are no templates', () => {
			expect(pickNextWorkout([], [], null)).toEqual({ kind: 'legacy', template: null })
		})

		it('returns first template when no sessions', () => {
			const templates = [tpl('a'), tpl('b'), tpl('c')]
			expect(pickNextWorkout(templates, [], null)).toEqual({ kind: 'legacy', template: tpl('a') })
		})

		it('cycles to next template after completion', () => {
			const templates = [tpl('a'), tpl('b'), tpl('c')]
			const sessions = [completed('b', 1000)]
			expect(pickNextWorkout(templates, sessions, null)).toEqual({ kind: 'legacy', template: tpl('c') })
		})

		it('wraps around at end of list', () => {
			const templates = [tpl('a'), tpl('b'), tpl('c')]
			const sessions = [completed('c', 1000)]
			expect(pickNextWorkout(templates, sessions, null)).toEqual({ kind: 'legacy', template: tpl('a') })
		})
	})

	describe('emptyActiveProgram', () => {
		it('returns emptyActiveProgram when active program has 0 workoutIds', () => {
			const program: ActiveProgramRef = { id: wpr('p'), name: 'PPL', workoutIds: [] }
			expect(pickNextWorkout([tpl('a')], [], program)).toEqual({
				kind: 'emptyActiveProgram',
				programName: 'PPL',
				programId: wpr('p')
			})
		})

		it('returns emptyActiveProgram when all program workoutIds are missing from templates', () => {
			const program: ActiveProgramRef = { id: wpr('p'), name: 'PPL', workoutIds: [wkt('gone')] }
			expect(pickNextWorkout([tpl('a'), tpl('b')], [], program)).toMatchObject({
				kind: 'emptyActiveProgram',
				programName: 'PPL'
			})
		})
	})

	describe('program mode', () => {
		const templates = [tpl('a'), tpl('b'), tpl('c'), tpl('d')]
		const program: ActiveProgramRef = {
			id: wpr('p'),
			name: 'PPL',
			workoutIds: [wkt('a'), wkt('b'), wkt('c')]
		}

		it('day 1 of N when no in-program completions', () => {
			expect(pickNextWorkout(templates, [], program)).toEqual({
				kind: 'program',
				template: tpl('a'),
				programName: 'PPL',
				programId: wpr('p'),
				day: 1,
				total: 3
			})
		})

		it('day 1 of 1 when single-item program', () => {
			const single: ActiveProgramRef = { ...program, workoutIds: [wkt('a')] }
			expect(pickNextWorkout(templates, [], single)).toMatchObject({ day: 1, total: 1, template: tpl('a') })
		})

		it('day 3 of 3 when last in-program session was item[1]', () => {
			expect(pickNextWorkout(templates, [completed('b', 1000)], program)).toMatchObject({
				kind: 'program',
				template: tpl('c'),
				day: 3,
				total: 3
			})
		})

		it('wraps to day 1 of 3 when last completion was the last item', () => {
			expect(pickNextWorkout(templates, [completed('c', 1000)], program)).toMatchObject({
				template: tpl('a'),
				day: 1,
				total: 3
			})
		})

		it('ignores sessions with workoutId NOT in active program', () => {
			// 'd' is in templates but not in program — it's an off-program completion
			const sessions = [completed('d', 2000), completed('a', 1000)]
			expect(pickNextWorkout(templates, sessions, program)).toMatchObject({
				template: tpl('b'),
				day: 2,
				total: 3
			})
		})

		it('skips sessions with null workoutId', () => {
			const sessions: ProgramCycleSession[] = [{ workoutId: null, completedAt: 5000 }, completed('a', 1000)]
			expect(pickNextWorkout(templates, sessions, program)).toMatchObject({ template: tpl('b'), day: 2 })
		})

		it('skips in-progress (completedAt = null) sessions', () => {
			const sessions: ProgramCycleSession[] = [{ workoutId: wkt('b'), completedAt: null }, completed('a', 1000)]
			expect(pickNextWorkout(templates, sessions, program)).toMatchObject({ template: tpl('b'), day: 2 })
		})

		it('starts at day 1 when last completion has been removed from program', () => {
			// Last completion was workout 'd', which is NOT in active program (a/b/c).
			// Since that completion is filtered out, behaves as no in-program completions.
			const sessions = [completed('d', 5000)]
			expect(pickNextWorkout(templates, sessions, program)).toMatchObject({
				template: tpl('a'),
				day: 1,
				total: 3
			})
		})

		it('reflects new order when items reordered after a session', () => {
			// After completing 'a', user reorders program to [b, c, a].
			// Last completion 'a' is at index 2 → next = (2+1)%3 = 0 → 'b'
			const reordered: ActiveProgramRef = { ...program, workoutIds: [wkt('b'), wkt('c'), wkt('a')] }
			expect(pickNextWorkout(templates, [completed('a', 1000)], reordered)).toMatchObject({
				template: tpl('b'),
				day: 1,
				total: 3
			})
		})

		it('takes the most recent in-program session even when sessions arrive out of order', () => {
			// Caller passes sessions ordered desc by completedAt; we re-sort defensively.
			const sessions = [completed('a', 1000), completed('b', 5000)]
			expect(pickNextWorkout(templates, sessions, program)).toMatchObject({ template: tpl('c'), day: 3 })
		})
	})
})
