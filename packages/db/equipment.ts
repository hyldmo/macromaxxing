import type { Equipment } from './custom-types'

/** Human labels for equipment enum values (snake_case → display). */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
	barbell: 'Barbell',
	ez_bar: 'EZ bar',
	trap_bar: 'Trap bar',
	dumbbell: 'Dumbbells',
	kettlebell: 'Kettlebell',
	squat_rack: 'Squat rack',
	bench_flat: 'Flat bench',
	bench_adjustable: 'Adjustable bench',
	preacher_bench: 'Preacher bench',
	smith_machine: 'Smith machine',
	cable_station: 'Cable station',
	lat_pulldown: 'Lat pulldown',
	pec_deck: 'Pec deck',
	chest_press_machine: 'Chest press machine',
	shoulder_press_machine: 'Shoulder press machine',
	chest_supported_row: 'Chest-supported row',
	leg_press: 'Leg press',
	hack_squat: 'Hack squat',
	leg_curl_machine: 'Leg curl machine',
	leg_extension_machine: 'Leg extension machine',
	calf_machine: 'Calf machine',
	hip_thrust_machine: 'Hip thrust machine',
	back_extension: 'Back extension',
	pullup_bar: 'Pull-up bar',
	dip_station: 'Dip station',
	suspension_trainer: 'Suspension trainer',
	resistance_band: 'Resistance bands',
	sled: 'Sled',
	battle_ropes: 'Battle ropes',
	boxing_bag: 'Boxing bag',
	rowing_machine: 'Rowing machine',
	ski_erg: 'Ski erg',
	air_bike: 'Air bike',
	spin_bike: 'Spin bike',
	treadmill: 'Treadmill',
	stair_climber: 'Stair climber'
}

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
	return items.map(e => EQUIPMENT_LABELS[e]).join(', ')
}
