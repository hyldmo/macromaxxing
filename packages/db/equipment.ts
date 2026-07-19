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
	smith_machine: 'Smith machine',
	cable_station: 'Cable station',
	lat_pulldown: 'Lat pulldown',
	leg_press: 'Leg press',
	leg_curl_machine: 'Leg curl machine',
	leg_extension_machine: 'Leg extension machine',
	calf_machine: 'Calf machine',
	preacher_bench: 'Preacher bench',
	pullup_bar: 'Pull-up bar',
	dip_station: 'Dip station',
	resistance_band: 'Resistance bands'
}

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
