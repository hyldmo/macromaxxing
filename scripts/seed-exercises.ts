/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */
import { execSync } from 'node:child_process'
import type { MuscleGroup } from '@macromaxxing/db'

const WRANGLER = 'yarn workspace @macromaxxing/workers wrangler'

function exec(sql: string) {
	const escaped = sql.replaceAll('"', '\\"')
	execSync(`${WRANGLER} d1 execute macromaxxing --local --command "${escaped}"`, {
		encoding: 'utf8',
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
}

interface ExerciseDef {
	name: string
	type: 'compound' | 'isolation'
	fatigueTier: 1 | 2 | 3 | 4
	muscles: Array<{ group: MuscleGroup; intensity: number }>
}

const EXERCISES: ExerciseDef[] = [
	{
		name: 'Bench Press',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'chest', intensity: 1.0 },
			{ group: 'triceps', intensity: 0.5 },
			{ group: 'front_delts', intensity: 0.3 }
		]
	},
	{
		name: 'Incline Bench Press',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'chest', intensity: 0.8 },
			{ group: 'front_delts', intensity: 0.5 },
			{ group: 'triceps', intensity: 0.4 }
		]
	},
	{
		name: 'Overhead Press',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'front_delts', intensity: 1.0 },
			{ group: 'side_delts', intensity: 0.5 },
			{ group: 'triceps', intensity: 0.5 }
		]
	},
	{
		name: 'Barbell Row',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'upper_back', intensity: 0.8 },
			{ group: 'lats', intensity: 0.8 },
			{ group: 'biceps', intensity: 0.5 },
			{ group: 'rear_delts', intensity: 0.3 }
		]
	},
	{
		name: 'Pull-Up',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'lats', intensity: 1.0 },
			{ group: 'upper_back', intensity: 0.6 },
			{ group: 'biceps', intensity: 0.5 }
		]
	},
	{
		name: 'Squat',
		type: 'compound',
		fatigueTier: 1,
		muscles: [
			{ group: 'quads', intensity: 1.0 },
			{ group: 'glutes', intensity: 0.7 },
			{ group: 'hamstrings', intensity: 0.3 },
			{ group: 'core', intensity: 0.3 }
		]
	},
	{
		name: 'Deadlift',
		type: 'compound',
		fatigueTier: 1,
		muscles: [
			{ group: 'hamstrings', intensity: 0.8 },
			{ group: 'glutes', intensity: 0.8 },
			{ group: 'upper_back', intensity: 0.6 },
			{ group: 'quads', intensity: 0.4 },
			{ group: 'core', intensity: 0.5 }
		]
	},
	{
		name: 'Romanian Deadlift',
		type: 'compound',
		fatigueTier: 2,
		muscles: [
			{ group: 'hamstrings', intensity: 1.0 },
			{ group: 'glutes', intensity: 0.7 },
			{ group: 'upper_back', intensity: 0.3 }
		]
	},
	{
		name: 'Lateral Raise',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'side_delts', intensity: 1.0 }]
	},
	{
		name: 'Bicep Curl',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'biceps', intensity: 1.0 }]
	},
	{
		name: 'Tricep Extension',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'triceps', intensity: 1.0 }]
	},
	{
		name: 'Leg Curl',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'hamstrings', intensity: 1.0 }]
	},
	{
		name: 'Leg Extension',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'quads', intensity: 1.0 }]
	},
	{
		name: 'Calf Raise',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'calves', intensity: 1.0 }]
	},
	{
		name: 'Rear Delt Fly',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'rear_delts', intensity: 1.0 }]
	},
	{
		name: 'Face Pull',
		type: 'isolation',
		fatigueTier: 3,
		muscles: [
			{ group: 'rear_delts', intensity: 0.7 },
			{ group: 'upper_back', intensity: 0.3 }
		]
	},
	{
		name: 'Cable Fly',
		type: 'isolation',
		fatigueTier: 3,
		muscles: [{ group: 'chest', intensity: 1.0 }]
	},
	{
		name: 'Preacher Curl',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'biceps', intensity: 1.0 }]
	},
	{
		name: 'Hammer Curl',
		type: 'isolation',
		fatigueTier: 3,
		muscles: [
			{ group: 'biceps', intensity: 0.7 },
			{ group: 'forearms', intensity: 0.5 }
		]
	},
	{
		name: 'Wrist Curl',
		type: 'isolation',
		fatigueTier: 4,
		muscles: [{ group: 'forearms', intensity: 1.0 }]
	}
]

interface StandardDef {
	compound: string
	isolation: string
	maxRatio: number
}

const STANDARDS: StandardDef[] = [
	{ compound: 'Overhead Press', isolation: 'Lateral Raise', maxRatio: 0.35 },
	{ compound: 'Bench Press', isolation: 'Cable Fly', maxRatio: 0.5 },
	{ compound: 'Bench Press', isolation: 'Tricep Extension', maxRatio: 0.45 },
	{ compound: 'Barbell Row', isolation: 'Bicep Curl', maxRatio: 0.4 },
	{ compound: 'Barbell Row', isolation: 'Rear Delt Fly', maxRatio: 0.3 },
	{ compound: 'Squat', isolation: 'Leg Extension', maxRatio: 0.45 },
	{ compound: 'Squat', isolation: 'Leg Curl', maxRatio: 0.4 }
]

console.log('Seeding system exercises...')
const now = Date.now()

for (const ex of EXERCISES) {
	const id = `exc_${ex.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/_+$/, '')}`
	exec(
		`INSERT OR REPLACE INTO exercises (id, user_id, name, type, fatigue_tier, created_at) VALUES ('${id}', NULL, '${ex.name}', '${ex.type}', ${ex.fatigueTier}, ${now})`
	)
	for (const m of ex.muscles) {
		const mid = `exm_${id.slice(4)}_${m.group}`
		exec(
			`INSERT OR IGNORE INTO exercise_muscles (id, exercise_id, muscle_group, intensity) VALUES ('${mid}', '${id}', '${m.group}', ${m.intensity})`
		)
	}
}

console.log(`  ${EXERCISES.length} exercises seeded`)

console.log('Seeding strength standards...')
for (const std of STANDARDS) {
	const compoundId = `exc_${std.compound
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/_+$/, '')}`
	const isolationId = `exc_${std.isolation
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/_+$/, '')}`
	const id = `ssr_${compoundId.slice(4)}_${isolationId.slice(4)}`
	exec(
		`INSERT OR IGNORE INTO strength_standards (id, compound_id, isolation_id, max_ratio, created_at) VALUES ('${id}', '${compoundId}', '${isolationId}', ${std.maxRatio}, ${now})`
	)
}

console.log(`  ${STANDARDS.length} strength standards seeded`)
console.log('Done!')
