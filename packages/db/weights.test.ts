import { describe, expect, it } from 'vitest'
import type { Equipment } from './custom-types'
import type { EquipmentRequirement } from './equipment'
import { implementCount, loadClass, nextLoadableWeight, weightSnapper, weightStepKg } from './weights'

const eq = (...items: Equipment[]): EquipmentRequirement[] => items.map(equipment => ({ equipment }))

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

describe('weightStepKg', () => {
	it('stays a small fraction of the load at every scale', () => {
		expect(weightStepKg(7.5)).toBe(0.5)
		expect(weightStepKg(12)).toBe(1)
		expect(weightStepKg(100)).toBe(2.5)
	})

	it('a light weight steps down to its neighbour, not past it', () => {
		// 7.5 - 2.5 = 5 skipped a third of the lift; the regression this rule exists for.
		expect(7.5 - weightStepKg(7.5)).toBe(7)
	})
})

describe('implementCount', () => {
	it('counts both bells, because a dumbbell weight is logged per bell', () => {
		expect(implementCount(eq('dumbbell', 'bench_flat'))).toBe(2)
		expect(implementCount(eq('kettlebell'))).toBe(2)
	})

	it('counts one of everything that carries the whole load on a single frame', () => {
		expect(implementCount(eq('barbell', 'squat_rack'))).toBe(1)
		expect(implementCount(eq('lat_pulldown'))).toBe(1)
		expect(implementCount(eq('leg_press'))).toBe(1)
		expect(implementCount(eq('smith_machine'))).toBe(1)
	})

	it('counts one when nothing carries load, so bodyweight volume is unchanged', () => {
		expect(implementCount([])).toBe(1)
		expect(implementCount(eq('pullup_bar'))).toBe(1)
	})

	it('follows loadClass — the bench a dumbbell press needs never decides the count', () => {
		expect(implementCount(eq('bench_adjustable', 'dumbbell'))).toBe(2)
		expect(implementCount(eq('bench_flat', 'barbell'))).toBe(1)
	})
})

describe('nextLoadableWeight', () => {
	it('always moves — a weight already on the grid steps off it', () => {
		expect(nextLoadableWeight(80, { equipment: eq('barbell') })).toBe(82.5)
		expect(nextLoadableWeight(6, { equipment: eq('dumbbell') })).toBe(7)
	})

	it('steps by the load class, not by the smallest plate in the building', () => {
		// A dumbbell goes up a whole bell; a dip belt takes one plate at a time.
		expect(nextLoadableWeight(12.5, { equipment: eq('dumbbell') })).toBe(15)
		expect(nextLoadableWeight(12.5, { equipment: eq('dip_station') })).toBe(13.75)
	})
})
