import { describe, expect, it } from 'vitest'
import { EXERCISE_GUIDES } from './exercise-guides-seed.ts'

// Must match the `name` field of every entry in `scripts/seed-exercises.ts`.
// Keep this list in sync when seed exercises change.
const SYSTEM_EXERCISE_NAMES = [
	'Bench Press',
	'Incline Bench Press',
	'Overhead Press',
	'Barbell Row',
	'Pull-Up',
	'Squat',
	'Deadlift',
	'Romanian Deadlift',
	'Lateral Raise',
	'Bicep Curl',
	'Tricep Extension',
	'Leg Curl',
	'Leg Extension',
	'Calf Raise',
	'Rear Delt Fly',
	'Face Pull',
	'Cable Fly',
	'Preacher Curl',
	'Hammer Curl',
	'Wrist Curl'
]

describe('EXERCISE_GUIDES seed', () => {
	it('has a guide for every system exercise', () => {
		for (const name of SYSTEM_EXERCISE_NAMES) {
			expect(EXERCISE_GUIDES[name], `missing guide for "${name}"`).toBeDefined()
		}
	})

	it('only contains keys for known system exercises', () => {
		for (const key of Object.keys(EXERCISE_GUIDES)) {
			expect(SYSTEM_EXERCISE_NAMES, `unknown exercise "${key}" in guides`).toContain(key)
		}
	})

	it('each guide has description and 3-5 cues', () => {
		for (const [name, guide] of Object.entries(EXERCISE_GUIDES)) {
			expect(guide.description.length, `"${name}" description too short`).toBeGreaterThan(20)
			expect(guide.cues.length, `"${name}" should have 3-5 cues`).toBeGreaterThanOrEqual(3)
			expect(guide.cues.length, `"${name}" should have 3-5 cues`).toBeLessThanOrEqual(5)
		}
	})
})
