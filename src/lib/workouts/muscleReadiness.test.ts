import type { FatigueTier, MuscleGroup, SetType } from '@macromaxxing/db'
import { describe, expect, it } from 'vitest'
import {
	collectSessionMuscleFatigue,
	computeMuscleReadiness,
	pendingRecovery,
	pendingRecoveryFromPriorSession,
	type ReadinessSessionInput,
	type ReadinessTemplateInput
} from './muscleReadiness'

const HOUR_MS = 3_600_000
const T0 = 1_784_385_065_304 // arbitrary epoch anchor

interface LogFixture {
	muscles: Array<[MuscleGroup, number]>
	fatigueTier?: FatigueTier
	setType?: SetType
}

function session(logs: LogFixture[], completedAt: number | null, startedAt = T0 - 2 * HOUR_MS): ReadinessSessionInput {
	return {
		startedAt,
		completedAt,
		logs: logs.map(log => ({
			setType: log.setType ?? 'working',
			exercise: {
				fatigueTier: log.fatigueTier ?? 4,
				muscles: log.muscles.map(([muscleGroup, intensity]) => ({ muscleGroup, intensity }))
			}
		}))
	}
}

function template(muscles: Array<[MuscleGroup, number]>[]): ReadinessTemplateInput {
	return {
		exercises: muscles.map(ms => ({
			exercise: { muscles: ms.map(([muscleGroup, intensity]) => ({ muscleGroup, intensity })) }
		}))
	}
}

describe('computeMuscleReadiness', () => {
	it('accumulates intensity × tierWeight per working set', () => {
		// 2 curls (tier 4, 1.0) + 2 hammers (tier 4, 0.7) → 2×0.25 + 2×0.7×0.25 = 0.85 units → 29h.
		const s = session(
			[
				{ muscles: [['biceps', 1]] },
				{ muscles: [['biceps', 1]] },
				{ muscles: [['biceps', 0.7]] },
				{ muscles: [['biceps', 0.7]] }
			],
			T0
		)
		const r = computeMuscleReadiness([s]).get('biceps')
		expect(r).toMatchObject({ requiredHours: 29, trainedAt: T0 })
		expect(r?.fatigueUnits).toBeCloseTo(0.85)
		expect(r?.readyAt).toBe(T0 + 29 * HOUR_MS)
	})

	it('ignores warmup and backoff sets', () => {
		const s = session(
			[
				{ muscles: [['chest', 1]], setType: 'warmup' },
				{ muscles: [['chest', 1]], setType: 'working', fatigueTier: 1 },
				{ muscles: [['chest', 1]], setType: 'backoff' }
			],
			T0
		)
		expect(computeMuscleReadiness([s]).get('chest')?.fatigueUnits).toBe(1)
	})

	it('ignores incidental intensities below the threshold', () => {
		const s = session([{ muscles: [['hamstrings', 0.2]] }], T0)
		expect(computeMuscleReadiness([s]).has('hamstrings')).toBe(false)
	})

	it('takes the most recent session per muscle, not the largest stimulus', () => {
		const heavyOld = session(
			Array.from({ length: 8 }, (): LogFixture => ({ muscles: [['chest', 1]], fatigueTier: 1 })),
			T0 - 48 * HOUR_MS
		)
		const lightNew = session([{ muscles: [['chest', 1]] }], T0)
		const r = computeMuscleReadiness([heavyOld, lightNew]).get('chest')
		expect(r).toMatchObject({ trainedAt: T0, fatigueUnits: 0.25 })
	})

	it('anchors in-progress sessions at startedAt', () => {
		const startedAt = T0 - HOUR_MS
		const s = session([{ muscles: [['quads', 1]] }], null, startedAt)
		expect(computeMuscleReadiness([s]).get('quads')?.trainedAt).toBe(startedAt)
	})

	it('tracks muscles independently across sessions', () => {
		const arms = session([{ muscles: [['biceps', 1]] }], T0)
		const legs = session([{ muscles: [['quads', 1]] }], T0 - 24 * HOUR_MS)
		const map = computeMuscleReadiness([arms, legs])
		expect(map.get('biceps')?.trainedAt).toBe(T0)
		expect(map.get('quads')?.trainedAt).toBe(T0 - 24 * HOUR_MS)
	})
})

describe('collectSessionMuscleFatigue', () => {
	it('matches computeMuscleReadiness for a single session', () => {
		const s = session([{ muscles: [['biceps', 1]] }, { muscles: [['biceps', 1]] }], T0)
		expect(collectSessionMuscleFatigue(s).get('biceps')).toBeCloseTo(0.5)
		expect(computeMuscleReadiness([s]).get('biceps')?.fatigueUnits).toBeCloseTo(0.5)
	})
})

describe('pendingRecoveryFromPriorSession', () => {
	it('only constrains muscles hit in both the prior session and next template', () => {
		const prior = session(
			[{ muscles: [['biceps', 1]] }, { muscles: [['biceps', 1]] }, { muscles: [['rear_delts', 1]] }],
			T0
		)
		const pull = template([
			[['lats', 1]],
			[
				['biceps', 0.6],
				['rear_delts', 1]
			]
		])
		const pending = pendingRecoveryFromPriorSession(prior, pull, T0 + 23 * HOUR_MS)
		expect(pending.map(p => p.muscleGroup).sort()).toEqual(['biceps', 'rear_delts'])
		expect(pending.find(p => p.muscleGroup === 'lats')).toBeUndefined()
	})

	it('does not inherit fatigue for muscles skipped in the prior session', () => {
		const heavyOld = session(
			Array.from({ length: 8 }, (): LogFixture => ({ muscles: [['biceps', 1]], fatigueTier: 1 })),
			T0 - 24 * HOUR_MS
		)
		const partialPush = session([{ muscles: [['chest', 1]], fatigueTier: 1 }], T0)
		const readiness = computeMuscleReadiness([heavyOld, partialPush])
		const pull = template([[['biceps', 1]]])

		expect(pendingRecovery(pull, readiness, T0 + 2 * HOUR_MS)).toHaveLength(1)
		expect(pendingRecoveryFromPriorSession(partialPush, pull, T0 + 2 * HOUR_MS)).toEqual([])
	})

	it('returns empty when the prior session skipped overlapping muscles', () => {
		const partialPush = session([{ muscles: [['chest', 1]], fatigueTier: 1 }], T0)
		const pull = template([[['biceps', 1]]])
		expect(pendingRecoveryFromPriorSession(partialPush, pull, T0 + HOUR_MS)).toEqual([])
	})

	it('returns empty when there is no prior session', () => {
		expect(pendingRecoveryFromPriorSession(null, template([[['biceps', 1]]]), T0)).toEqual([])
	})
})

describe('pendingRecovery', () => {
	const readiness = computeMuscleReadiness([
		session(
			[
				{ muscles: [['biceps', 1]] },
				{ muscles: [['biceps', 1]] },
				{ muscles: [['rear_delts', 1]] },
				{ muscles: [['rear_delts', 1]] },
				{ muscles: [['side_delts', 1]] }
			],
			T0
		)
	])
	// 2 working sets × tier 4 → 0.5 units → 27h for each muscle.

	it('surfaces only template muscles still inside their window', () => {
		const pullB = template([
			[
				['lats', 1],
				['biceps', 0.6]
			],
			[['rear_delts', 1]]
		])
		const pending = pendingRecovery(pullB, readiness, T0 + 23 * HOUR_MS)
		expect(pending.map(p => p.muscleGroup).sort()).toEqual(['biceps', 'rear_delts'])
		expect(pending[0].remainingHours).toBe(4)
	})

	it('ignores template muscles hit only incidentally', () => {
		const pending = pendingRecovery(template([[['side_delts', 0.2]]]), readiness, T0 + HOUR_MS)
		expect(pending).toEqual([])
	})

	it('returns empty once the window has passed', () => {
		const pending = pendingRecovery(template([[['biceps', 1]]]), readiness, T0 + 28 * HOUR_MS)
		expect(pending).toEqual([])
	})

	it('sorts most-binding first', () => {
		const mixed = computeMuscleReadiness([
			session([{ muscles: [['biceps', 1]], fatigueTier: 1 }], T0), // 1 unit → 30h
			session([{ muscles: [['quads', 1]] }], T0 - 3 * HOUR_MS) // 0.25 units → 26h, earlier
		])
		const pending = pendingRecovery(
			template([
				[
					['biceps', 1],
					['quads', 1]
				]
			]),
			mixed,
			T0
		)
		expect(pending.map(p => p.muscleGroup)).toEqual(['biceps', 'quads'])
	})
})
