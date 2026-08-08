/**
 * What weight a lifter can actually put on the bar — the grid every generated set snaps to.
 *
 * Two inputs, in priority order:
 *
 * 1. **The weights they have already logged** (`ladder`). A gym's rack is a discrete list, not an
 *    increment: adjustable dumbbells land on 6.5 / 11.5 / 13.5, a pin stack on 65 / 70 / 73. No
 *    formula reproduces those, and we don't have to guess — `workout_logs` already records every
 *    weight the user has genuinely loaded on that equipment at that location.
 * 2. **The load class of the equipment** (`equipment`). The fallback for a lift with no history,
 *    and the tolerance that decides whether a ladder rung is close enough to be the same weight.
 *    Plates load in PAIRS on a bar (2.5 kg steps from a 1.25 kg plate) but SINGLY on a dip belt
 *    (1.25 kg steps) — the equipment rows are what tell those apart.
 *
 * Pure. Shared by the session planner (`src/lib/workouts/sets.ts`) and the backend's
 * `generateWarmup` / `generateBackoff`, so the app and MCP agents prescribe the same numbers.
 */

import type { Equipment } from './custom-types'
import type { EquipmentRequirement } from './equipment'
import { plateIncrement, roundWeight, type WeightUnit } from './formulas'

/**
 * Equipment that carries the load, most specific first. An exercise lists everything it needs —
 * an incline dumbbell press needs a bench too — but only one of those has a weight grid, so the
 * first match wins. Everything omitted (benches, racks, cardio) never determines a weight.
 */
export const LOAD_CLASSES = [
	'dumbbell',
	'kettlebell',
	'barbell',
	'ez_bar',
	'trap_bar',
	'smith_machine',
	'leg_press',
	'hack_squat',
	'cable_station',
	'lat_pulldown',
	'pec_deck',
	'chest_press_machine',
	'shoulder_press_machine',
	'chest_supported_row',
	'leg_curl_machine',
	'leg_extension_machine',
	'calf_machine',
	'hip_thrust_machine',
	'back_extension',
	'pullup_bar',
	'dip_station',
	'sled'
] as const satisfies readonly Equipment[]

export type LoadClass = (typeof LOAD_CLASSES)[number]

const LOAD_CLASS_SET: ReadonlySet<Equipment> = new Set(LOAD_CLASSES)

export const isLoadClass = (equipment: Equipment): equipment is LoadClass => LOAD_CLASS_SET.has(equipment)

/** The equipment an exercise's weight actually sits on, or null when nothing it needs holds load. */
export function loadClass(required: readonly EquipmentRequirement[]): LoadClass | null {
	const needed = new Set(required.map(r => r.equipment))
	return LOAD_CLASSES.find(c => needed.has(c)) ?? null
}

/**
 * Smallest step this load class moves in, in kg. Not "the smallest plate" — the smallest change a
 * lifter can make to the load:
 * - Bars take plates in pairs, so the 1.25 kg plate is a 2.5 kg step.
 * - A dip belt or a sled post takes one plate at a time, so 1.25 kg is a real step there.
 * - Fixed dumbbells and kettlebells are a rack of discrete bells, not a loadable bar.
 * - Selectorized stacks move a whole plate at a time (~5 kg); the half-plate add-on some have
 *   shows up in the user's own ladder rather than being assumed here.
 */
function loadClassIncrementKg(cls: LoadClass, weight: number): number {
	switch (cls) {
		case 'dumbbell':
			return weight <= 10 ? 1 : 2.5
		case 'kettlebell':
			return 4
		case 'barbell':
		case 'ez_bar':
		case 'trap_bar':
		case 'smith_machine':
		case 'leg_press':
		case 'hack_squat':
			return 2.5
		case 'pullup_bar':
		case 'dip_station':
		case 'sled':
			return 1.25
		default:
			return 5
	}
}

export type SnapDirection = 'nearest' | 'up' | 'down'

/** Snap a computed weight (warmup %, backoff %, estimate) onto something loadable. */
export type WeightSnapper = (weight: number, direction?: SnapDirection) => number

/** The equipment-blind fallback: the generic plate ladder. Used when nothing is known about a lift. */
export const defaultSnapper: WeightSnapper = (weight, direction = 'nearest') => roundWeight(weight, 'kg', direction)

export interface WeightSnapperInput {
	/** The exercise's equipment rows — picks the load class, and with it the step size. */
	equipment?: readonly EquipmentRequirement[]
	/** Weights the user has actually logged on this load class, any order. */
	ladder?: readonly number[]
	unit?: WeightUnit
}

/**
 * Build the snapper for one exercise.
 *
 * The ladder is a SAMPLE of the gym's grid, never an inventory of it — so it only overrides the
 * plate grid where it has actually been sampled: the target has to fall between two rungs no
 * further apart than a couple of increments. Inside such a gap the rungs are consecutive notches,
 * so a target landing between them is a weight that doesn't exist and the rung does (6.0 → 6.5).
 * A wide gap means the region was never sampled — 19 kg sitting between a logged 16 and 22.5
 * says nothing about whether 20 exists, so the grid wins. Outside the ladder's range, likewise:
 * one 24 kg dumbbell in the history must not drag a 40 kg target down to it.
 */
export function weightSnapper({ equipment, ladder, unit = 'kg' }: WeightSnapperInput): WeightSnapper {
	const cls = equipment ? loadClass(equipment) : null
	const rungs = ladder && ladder.length > 0 ? [...ladder].sort((a, b) => a - b) : null

	return (weight, direction = 'nearest') => {
		const increment =
			cls && unit === 'kg' ? loadClassIncrementKg(cls, Math.abs(weight)) : plateIncrement(Math.abs(weight), unit)
		const grid = snapToIncrement(weight, increment, direction)
		if (!rungs) return grid

		const below = rungs.findLast(r => r <= weight)
		const above = rungs.find(r => r >= weight)
		if (below === undefined || above === undefined) return grid
		if (below === above) return below
		if (above - below > SAMPLED_GAP_INCREMENTS * increment) return grid

		if (direction === 'up') return above
		if (direction === 'down') return below
		// Ties go up, the same way Math.round resolves them on the plate grid — a target exactly
		// between two rungs shouldn't depend on which of the two mechanisms produced it.
		return weight - below < above - weight ? below : above
	}
}

/** How wide a gap between two logged rungs can be before it stops looking like consecutive notches. */
const SAMPLED_GAP_INCREMENTS = 2

function snapToIncrement(weight: number, increment: number, direction: SnapDirection): number {
	// Snap the ratio first to avoid float error (20*0.7 = 14.000000000000002 → ceil → 15).
	const ratio = Math.round((weight / increment) * 1e10) / 1e10
	const fn = direction === 'up' ? Math.ceil : direction === 'down' ? Math.floor : Math.round
	return fn(ratio) * increment
}

/**
 * One notch up — the weight a lifter moves to when the current one gets easy.
 *
 * "Add the smallest plate" is only the answer for a bar. On their dumbbell rack the next weight up
 * from 6.5 is 8, and on a pin stack it's the next pin hole, so this asks the same snapper the
 * warmups use rather than doing arithmetic on plate sizes.
 */
export function nextLoadableWeight(weight: number, input: WeightSnapperInput): number {
	// Nudge past the current weight so a weight already sitting on a rung steps off it.
	return weightSnapper(input)(weight + 1e-6, 'up')
}

/** Per-load-class ladders, as returned by `workout.weightLadders`. */
export type WeightLadders = Partial<Record<LoadClass, number[]>>

/** Resolve an exercise's equipment + the user's ladders into the snapper input for that lift. */
export function snapperInputFor(
	equipment: readonly EquipmentRequirement[] | undefined,
	ladders: WeightLadders | undefined
): WeightSnapperInput {
	const cls = equipment ? loadClass(equipment) : null
	return { equipment, ladder: cls ? ladders?.[cls] : undefined }
}

/** The snapper for an exercise given the user's ladders — the call every planner site makes. */
export function snapperFor(
	equipment: readonly EquipmentRequirement[] | undefined,
	ladders: WeightLadders | undefined
): WeightSnapper {
	return weightSnapper(snapperInputFor(equipment, ladders))
}
