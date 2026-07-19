import { startCase } from 'es-toolkit'
import type { Equipment } from './custom-types'

/** Display label for an equipment value — plain title case of the enum value. */
export const formatEquipment = (equipment: Equipment): string => startCase(equipment)

export interface EquipmentCategory {
	label: string
	items: readonly Equipment[]
}

/** Display grouping for checklist UIs. Covers EQUIPMENT exactly — enforced by test. */
export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
	{ label: 'Free weights', items: ['barbell', 'ez_bar', 'trap_bar', 'dumbbell', 'kettlebell'] },
	{
		label: 'Racks & benches',
		items: ['squat_rack', 'bench_flat', 'bench_adjustable', 'preacher_bench', 'smith_machine']
	},
	{ label: 'Cables', items: ['cable_station', 'lat_pulldown'] },
	{
		label: 'Machines',
		items: [
			'pec_deck',
			'chest_press_machine',
			'shoulder_press_machine',
			'chest_supported_row',
			'leg_press',
			'hack_squat',
			'leg_curl_machine',
			'leg_extension_machine',
			'calf_machine',
			'hip_thrust_machine',
			'back_extension'
		]
	},
	{ label: 'Rig & bodyweight', items: ['pullup_bar', 'dip_station', 'suspension_trainer', 'resistance_band'] },
	{ label: 'Conditioning', items: ['sled', 'battle_ropes', 'boxing_bag'] },
	{ label: 'Cardio', items: ['rowing_machine', 'ski_erg', 'air_bike', 'spin_bike', 'treadmill', 'stair_climber'] }
]

export interface EquipmentRequirement {
	equipment: Equipment
}

/** Build the availability set from a location's equipment rows. */
export function equipmentSet(rows: readonly EquipmentRequirement[]): Set<Equipment> {
	return new Set(rows.map(r => r.equipment))
}

/**
 * Equipment an exercise requires that the location lacks. An exercise with no
 * requirements is bodyweight and never missing anything; a location with an
 * empty set only satisfies bodyweight exercises. "No location selected" is a
 * call-site concern — don't compute warnings without one.
 */
export function missingEquipment(
	required: readonly EquipmentRequirement[],
	available: ReadonlySet<Equipment>
): Equipment[] {
	return required.map(r => r.equipment).filter(e => !available.has(e))
}

export function formatEquipmentList(items: readonly Equipment[]): string {
	return items.map(formatEquipment).join(', ')
}
