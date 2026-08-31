/**
 * What weight a lifter can actually put on the bar — the grid every generated set snaps to.
 *
 * One input: the load class of the equipment. Plates load in PAIRS on a bar (2.5 kg steps from a
 * 1.25 kg plate) but SINGLY on a dip belt (1.25 kg steps), and the exercise's equipment rows are
 * what tell those apart.
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

/** The equipment an exercise's weight actually sits on, or null when nothing it needs holds load. */
export function loadClass(required: readonly EquipmentRequirement[]): LoadClass | null {
	const needed = new Set(required.map(r => r.equipment))
	return LOAD_CLASSES.find(c => needed.has(c)) ?? null
}

/**
 * How many of the load-bearing implement the lifter holds, for VOLUME accounting only.
 *
 * A weight is always logged per implement, because that is what the lifter picks off the rack and
 * what the snapper has to land on: a pair of 30 kg dumbbells is entered as 30. Tonnage asks a
 * different question — how much left the floor — and the answer there is 60. Every other load class
 * is one bar, stack, or sled, so only bells count double.
 *
 * NEVER multiply a weight by this before an e1RM, a warmup/backoff generation, a snap, or anything
 * rendered on a set row. All of those are per-implement and correct as they
 * stand. Doubling there would restate every dumbbell PR overnight, trip `isStalledExercise` on the
 * discontinuity, and make the planner prescribe bells that don't exist.
 *
 * Derived rather than stored, so it needs no column and no backfill. The known cost is unilateral
 * work: a one-arm row requires `dumbbell` like any two-bell lift and comes out 2. An exercise with
 * no equipment rows comes out 1, which is the volume it already had.
 */
export function implementCount(required: readonly EquipmentRequirement[]): 1 | 2 {
	const cls = loadClass(required)
	return cls === 'dumbbell' || cls === 'kettlebell' ? 2 : 1
}

/**
 * Smallest step this load class moves in, in kg. Not "the smallest plate" — the smallest change a
 * lifter can make to the load:
 * - Bars take plates in pairs, so the 1.25 kg plate is a 2.5 kg step.
 * - A dip belt or a sled post takes one plate at a time, so 1.25 kg is a real step there.
 * - Fixed dumbbells and kettlebells are a rack of discrete bells, not a loadable bar.
 * - Selectorized stacks move a whole plate at a time (~5 kg); the half-plate add-on some have is
 *   not assumed, since most stacks don't have one.
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

/**
 * How much one arrow press (or ↑/↓) moves a hand-entered weight, in kg.
 *
 * Deliberately NOT `loadClassIncrementKg`: that answers "what can this gym load", which is the
 * right question for a PRESCRIBED weight and the wrong one for a typed weight — the field records
 * what was actually lifted, on the racks the plate grid can't describe (an adjustable dumbbell at
 * 6.5, a fixed 7 kg bell, microplates), which is precisely when a lifter reaches for the arrows.
 *
 * Proportional to the load, because a fixed step can't be right at both ends: 2.5 kg off a 100 kg
 * squat is a nudge, off a 7.5 kg curl it's a third of the lift.
 */
export function weightStepKg(weight: number): number {
	const abs = Math.abs(weight)
	if (abs < 10) return 0.5
	if (abs < 20) return 1
	return 2.5
}

export type SnapDirection = 'nearest' | 'up' | 'down'

/** Snap a computed weight (warmup %, backoff %, estimate) onto something loadable. */
export type WeightSnapper = (weight: number, direction?: SnapDirection) => number

/** The equipment-blind fallback: the generic plate ladder. Used when nothing is known about a lift. */
export const defaultSnapper: WeightSnapper = (weight, direction = 'nearest') => roundWeight(weight, 'kg', direction)

export interface WeightSnapperInput {
	/** The exercise's equipment rows — picks the load class, and with it the step size. */
	equipment?: readonly EquipmentRequirement[]
	unit?: WeightUnit
}

/** Build the snapper for one exercise. */
export function weightSnapper({ equipment, unit = 'kg' }: WeightSnapperInput): WeightSnapper {
	const cls = equipment ? loadClass(equipment) : null

	return (weight, direction = 'nearest') => {
		const increment =
			cls && unit === 'kg' ? loadClassIncrementKg(cls, Math.abs(weight)) : plateIncrement(Math.abs(weight), unit)
		return snapToIncrement(weight, increment, direction)
	}
}

function snapToIncrement(weight: number, increment: number, direction: SnapDirection): number {
	// Snap the ratio first to avoid float error (20*0.7 = 14.000000000000002 → ceil → 15).
	const ratio = Math.round((weight / increment) * 1e10) / 1e10
	const fn = direction === 'up' ? Math.ceil : direction === 'down' ? Math.floor : Math.round
	return fn(ratio) * increment
}

/**
 * One notch up — the weight a lifter moves to when the current one gets easy.
 *
 * "Add the smallest plate" is only the answer for a bar — a dumbbell rack steps by a whole bell and
 * a pin stack by a plate — so this asks the same snapper the warmups use rather than doing
 * arithmetic on plate sizes.
 */
export function nextLoadableWeight(weight: number, input: WeightSnapperInput): number {
	// Nudge past the current weight so a weight already sitting on a rung steps off it.
	return weightSnapper(input)(weight + 1e-6, 'up')
}
