import { describe, expect, it } from 'vitest'
import type { Equipment } from './custom-types'
import type { EquipmentRequirement } from './equipment'
import { generateBackoffSets, workingTargetsFromBackoff } from './sets'
import { loadClass, nextLoadableWeight, snapperFor, weightSnapper } from './weights'

const eq = (...items: Equipment[]): EquipmentRequirement[] => items.map(equipment => ({ equipment }))

/** An adjustable home dumbbell set: handle plus plate pairs, so the rungs are irregular. */
const HOME_DUMBBELLS = [5, 6.5, 8, 11.5, 12.5, 13.5, 14, 15, 16, 22.5, 24]

describe('loadClass', () => {
	it('picks the thing carrying the weight, not the thing holding the lifter', () => {
		expect(loadClass(eq('bench_flat', 'dumbbell'))).toBe('dumbbell')
		expect(loadClass(eq('squat_rack', 'barbell'))).toBe('barbell')
	})

	it('is null for bodyweight — nothing it needs holds load', () => {
		expect(loadClass([])).toBeNull()
		expect(loadClass(eq('suspension_trainer'))).toBeNull()
	})
})

describe('weightSnapper — equipment grid, no history', () => {
	it('bars move in 2.5kg steps: plates go on in pairs', () => {
		const snap = weightSnapper({ equipment: eq('barbell') })
		expect(snap(81)).toBe(80)
		expect(snap(6)).toBe(5)
	})

	it('a dip belt takes one plate at a time, so 1.25kg is a real step there', () => {
		expect(weightSnapper({ equipment: eq('dip_station') })(11)).toBe(11.25)
		expect(weightSnapper({ equipment: eq('barbell') })(11)).toBe(10)
	})

	it('pin stacks move a whole plate (~5kg)', () => {
		expect(weightSnapper({ equipment: eq('lat_pulldown') })(63)).toBe(65)
	})

	it('light dumbbells step by 1kg, heavier ones by 2.5', () => {
		const snap = weightSnapper({ equipment: eq('dumbbell', 'bench_flat') })
		expect(snap(6)).toBe(6)
		expect(snap(6.4)).toBe(6)
		expect(snap(14)).toBe(15)
	})

	it('falls back to the generic plate ladder when the exercise declares no equipment', () => {
		expect(weightSnapper({})(14)).toBe(15)
	})
})

describe('weightSnapper — the user’s own ladder', () => {
	const snap = weightSnapper({ equipment: eq('dumbbell'), ladder: HOME_DUMBBELLS })

	it('prefers the rung that exists in their gym over the round number', () => {
		// 10kg working set warms up at 6.0 — but their rack jumps 5 → 6.5.
		expect(snap(6)).toBe(6.5)
		expect(snap(12.4)).toBe(12.5)
	})

	it('breaks a tie upward, the way Math.round does on the grid', () => {
		expect(snap(13)).toBe(13.5)
	})

	it('leaves the grid alone across a gap it has never sampled', () => {
		// Nothing logged between 16 and 22.5: that says nothing about whether 20 exists, so 19
		// rounds normally instead of jumping 3.5kg to the one rung it has seen.
		expect(snap(19)).toBe(20)
	})

	it('never extrapolates past the ends of the ladder', () => {
		expect(snap(40)).toBe(40)
		expect(snap(2)).toBe(2)
	})

	it('respects direction: up takes the next rung, down the previous one', () => {
		expect(snap(12, 'up')).toBe(12.5)
		expect(snap(12, 'down')).toBe(11.5)
	})

	it('ladder is scoped to the load class — a barbell lift never snaps to dumbbell rungs', () => {
		expect(snapperFor(eq('barbell'), { dumbbell: HOME_DUMBBELLS })(6)).toBe(5)
		expect(snapperFor(eq('dumbbell'), { dumbbell: HOME_DUMBBELLS })(6)).toBe(6.5)
	})
})

describe('nextLoadableWeight', () => {
	it('is the next rung on the rack, not the current weight plus a plate', () => {
		const rack = { equipment: eq('dumbbell'), ladder: HOME_DUMBBELLS }
		expect(nextLoadableWeight(6.5, rack)).toBe(8)
		expect(nextLoadableWeight(5, rack)).toBe(6.5)
	})

	it('always moves — a weight already on the grid steps off it', () => {
		expect(nextLoadableWeight(80, { equipment: eq('barbell') })).toBe(82.5)
		expect(nextLoadableWeight(6, { equipment: eq('dumbbell') })).toBe(7)
	})

	it('falls back to the plate grid past the end of the ladder', () => {
		expect(nextLoadableWeight(24, { equipment: eq('dumbbell'), ladder: HOME_DUMBBELLS })).toBe(25)
	})
})

describe('backoff inversion on an equipment grid', () => {
	// TimerMode stores an edited backoff as the working target it implies, so generating and
	// inverting must round-trip exactly or the number the user typed comes back as another one.
	// This is why backoffs use the equipment grid and NOT the logged ladder, whose irregular gaps
	// make the relationship non-invertible (see GeneratePlannedSetsInput.gridSnap).
	const snap = weightSnapper({ equipment: eq('dumbbell') })

	it('round-trips every backoff the grid can produce', () => {
		const reachable = new Set<number>()
		for (let working = 2.5; working <= 60; working += 2.5) {
			reachable.add(generateBackoffSets(working, 8, 1, 0, snap)[0].weightKg)
		}
		for (const weightKg of reachable) {
			const inverted = workingTargetsFromBackoff(weightKg, 10, 0, snap)
			expect(inverted).not.toBeNull()
			expect(generateBackoffSets(inverted!.weightKg!, inverted!.reps, 1, 0, snap)[0]).toEqual({
				weightKg,
				reps: 10,
				setType: 'backoff'
			})
		}
	})
})
