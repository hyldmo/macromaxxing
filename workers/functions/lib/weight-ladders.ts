/**
 * Derive the weights a user can actually load from what they have already logged.
 *
 * A gym's grid is a discrete list, not an increment — adjustable dumbbells land on 6.5 / 11.5 /
 * 13.5, a pin stack on 65 / 70 / 73 — so generated warmups and backoffs snap to these rungs rather
 * than to a rounded number that nothing in the building can make. Shared by `workout.weightLadders`
 * (the UI's session-planner feed) and the `generateWarmup` / `generateBackoff` generators.
 */

import {
	exerciseEquipment,
	isLoadClass,
	LOAD_CLASSES,
	type LoadClass,
	type Location,
	type WeightLadders,
	workoutLogs,
	workoutSessions
} from '@macromaxxing/db'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import type { Database } from './db'

/**
 * A weight has to show up twice before it counts as a rung. A single appearance is as likely to be
 * a typo (6.3 kg between a 6.5 and a 7) as a real notch on the rack, and a bad rung would be
 * prescribed back to the user indefinitely.
 */
const MIN_USES = 2

export async function loadWeightLadders(
	db: Database,
	userId: string,
	locationId?: Location['id'] | null
): Promise<WeightLadders> {
	// Driven FROM workout_logs, so tenancy rides on the session join — never on the logs alone.
	const rows = await db
		.select({
			equipment: exerciseEquipment.equipment,
			locationId: workoutSessions.locationId,
			weightKg: workoutLogs.weightKg,
			uses: sql<number>`count(*)`
		})
		.from(workoutLogs)
		.innerJoin(workoutSessions, eq(workoutSessions.id, workoutLogs.sessionId))
		.innerJoin(exerciseEquipment, eq(exerciseEquipment.exerciseId, workoutLogs.exerciseId))
		.where(
			and(
				eq(workoutSessions.userId, userId),
				gt(workoutLogs.weightKg, 0),
				inArray(exerciseEquipment.equipment, [...LOAD_CLASSES])
			)
		)
		.groupBy(exerciseEquipment.equipment, workoutSessions.locationId, workoutLogs.weightKg)

	const here = new Map<LoadClass, Map<number, number>>()
	const anywhere = new Map<LoadClass, Map<number, number>>()
	const bump = (into: Map<LoadClass, Map<number, number>>, cls: LoadClass, kg: number, uses: number) => {
		const byWeight = into.get(cls) ?? new Map<number, number>()
		byWeight.set(kg, (byWeight.get(kg) ?? 0) + uses)
		into.set(cls, byWeight)
	}

	for (const row of rows) {
		if (!isLoadClass(row.equipment)) continue
		bump(anywhere, row.equipment, row.weightKg, row.uses)
		if (locationId && row.locationId === locationId) bump(here, row.equipment, row.weightKg, row.uses)
	}

	const rungs = (byWeight: Map<number, number> | undefined): number[] =>
		[...(byWeight ?? [])]
			.filter(([, uses]) => uses >= MIN_USES)
			.map(([kg]) => kg)
			.sort((a, b) => a - b)

	const ladders: WeightLadders = {}
	for (const cls of new Set([...anywhere.keys(), ...here.keys()])) {
		// This gym's own rungs when it has any: a home dumbbell set and a commercial rack are
		// different grids, and merging them invents weights that exist in neither.
		const local = rungs(here.get(cls))
		const resolved = local.length > 0 ? local : rungs(anywhere.get(cls))
		if (resolved.length > 0) ladders[cls] = resolved
	}
	return ladders
}
