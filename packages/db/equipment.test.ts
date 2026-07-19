import { describe, expect, it } from 'vitest'
import { equipmentSet, formatEquipmentList, missingEquipment } from './equipment'

const rows = (...equipment: Parameters<typeof formatEquipmentList>[0]) => equipment.map(e => ({ equipment: e }))

describe('missingEquipment', () => {
	it('returns nothing for bodyweight exercises (no requirements)', () => {
		expect(missingEquipment([], new Set())).toEqual([])
		expect(missingEquipment([], new Set(['barbell']))).toEqual([])
	})

	it('returns nothing when all requirements are available', () => {
		expect(missingEquipment(rows('barbell', 'squat_rack'), new Set(['barbell', 'squat_rack', 'dumbbell']))).toEqual(
			[]
		)
	})

	it('returns only the missing subset, in requirement order', () => {
		expect(missingEquipment(rows('barbell', 'bench_flat', 'squat_rack'), new Set(['bench_flat']))).toEqual([
			'barbell',
			'squat_rack'
		])
	})

	it('returns everything against an empty location', () => {
		expect(missingEquipment(rows('cable_station'), new Set())).toEqual(['cable_station'])
	})
})

describe('equipmentSet', () => {
	it('collects equipment values from relation rows', () => {
		expect(equipmentSet(rows('barbell', 'dumbbell'))).toEqual(new Set(['barbell', 'dumbbell']))
	})
})

describe('formatEquipmentList', () => {
	it('joins human labels', () => {
		expect(formatEquipmentList(['ez_bar', 'pullup_bar'])).toBe('EZ bar, Pull-up bar')
	})
})
