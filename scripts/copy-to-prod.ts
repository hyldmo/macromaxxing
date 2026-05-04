/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
	Exercise,
	ExerciseMuscle,
	Ingredient,
	IngredientUnit,
	MealPlan,
	MealPlanInventory,
	MealPlanSlot,
	Recipe,
	RecipeIngredient,
	UserSettings,
	Workout,
	WorkoutExercise,
	WorkoutLog,
	WorkoutSession
} from '@macromaxxing/db'
import type { D1Row } from './types'

const LOCAL_USER = 'user_39I5kFnlAoJmYkhH14BK4piLrxT'
const PROD_USER = 'user_39RDb27BgKave26JTw4nvsUYP8L'
const WRANGLER = 'yarn workspace @macromaxxing/workers wrangler'

function query<T>(sql: string, remote = false): D1Row<T>[] {
	const flag = remote ? '--remote' : '--local'
	const escaped = sql.replaceAll('"', '\\"')
	const out = execSync(`${WRANGLER} d1 execute macromaxxing ${flag} --json --command "${escaped}"`, {
		encoding: 'utf8',
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
	return (JSON.parse(out) as [{ results: D1Row<T>[] }])[0].results
}

function sqlVal(v: unknown): string {
	if (v === null || v === undefined || v === 'null') return 'NULL'
	if (typeof v === 'number') return String(v)
	return `'${String(v).replaceAll("'", "''")}'`
}

function buildInserts<T extends Record<string, unknown>>(table: string, rows: T[]): string {
	return rows
		.map(row => {
			const cols = Object.keys(row)
			const vals = cols.map(c => sqlVal(row[c]))
			return `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`
		})
		.join('\n')
}

function remapUser<T extends { user_id: string }>(rows: T[]): T[] {
	return rows.map(row => ({ ...row, user_id: PROD_USER }))
}

function remapUserNullable<T extends { user_id: string | null }>(rows: T[]): T[] {
	return rows.map(row => (row.user_id === LOCAL_USER ? { ...row, user_id: PROD_USER } : row))
}

// ─── Export local data ──────────────────────────────────────────────

console.log('Exporting local data...')

// User settings (skip encrypted AI keys — they won't work cross-env)
const userSettings = query<UserSettings>(`SELECT * FROM user_settings WHERE user_id = '${LOCAL_USER}'`)

// Ingredients
const ingredients = query<Ingredient>(`SELECT * FROM ingredients WHERE user_id = '${LOCAL_USER}'`)
const ingredientUnits = query<IngredientUnit>(
	`SELECT iu.* FROM ingredient_units iu JOIN ingredients i ON iu.ingredient_id = i.id WHERE i.user_id = '${LOCAL_USER}'`
)

// Recipes
const recipes = query<Recipe>(`SELECT * FROM recipes WHERE user_id = '${LOCAL_USER}'`)
const recipeIngredients = query<RecipeIngredient>(
	`SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON ri.recipe_id = r.id WHERE r.user_id = '${LOCAL_USER}'`
)

// Meal plans
const mealPlans = query<MealPlan>(`SELECT * FROM meal_plans WHERE user_id = '${LOCAL_USER}'`)
const mealPlanInventory = query<MealPlanInventory>(
	`SELECT mpi.* FROM meal_plan_inventory mpi JOIN meal_plans mp ON mpi.meal_plan_id = mp.id WHERE mp.user_id = '${LOCAL_USER}'`
)
const mealPlanSlots = query<MealPlanSlot>(
	`SELECT mps.* FROM meal_plan_slots mps JOIN meal_plan_inventory mpi ON mps.inventory_id = mpi.id JOIN meal_plans mp ON mpi.meal_plan_id = mp.id WHERE mp.user_id = '${LOCAL_USER}'`
)

// Exercises (user-created only — system exercises are seeded separately)
const exercises = query<Exercise>(`SELECT * FROM exercises WHERE user_id = '${LOCAL_USER}'`)
const exerciseMuscles = query<ExerciseMuscle>(
	`SELECT em.* FROM exercise_muscles em JOIN exercises e ON em.exercise_id = e.id WHERE e.user_id = '${LOCAL_USER}'`
)

// Workouts
const workouts = query<Workout>(`SELECT * FROM workouts WHERE user_id = '${LOCAL_USER}'`)
const workoutExercises = query<WorkoutExercise>(
	`SELECT we.* FROM workout_exercises we JOIN workouts w ON we.workout_id = w.id WHERE w.user_id = '${LOCAL_USER}'`
)

// Sessions & logs
const workoutSessions = query<WorkoutSession>(`SELECT * FROM workout_sessions WHERE user_id = '${LOCAL_USER}'`)
const workoutLogs = query<WorkoutLog>(
	`SELECT wl.* FROM workout_logs wl JOIN workout_sessions ws ON wl.session_id = ws.id WHERE ws.user_id = '${LOCAL_USER}'`
)

console.log(
	[
		`  ${userSettings.length} user_settings`,
		`  ${ingredients.length} ingredients, ${ingredientUnits.length} units`,
		`  ${recipes.length} recipes, ${recipeIngredients.length} recipe_ingredients`,
		`  ${mealPlans.length} meal_plans, ${mealPlanInventory.length} inventory, ${mealPlanSlots.length} slots`,
		`  ${exercises.length} exercises, ${exerciseMuscles.length} exercise_muscles`,
		`  ${workouts.length} workouts, ${workoutExercises.length} workout_exercises`,
		`  ${workoutSessions.length} sessions, ${workoutLogs.length} logs`
	].join('\n')
)

// ─── Build SQL — order matters for foreign keys ─────────────────────

const sql = [
	buildInserts('user_settings', remapUser(userSettings)),
	buildInserts('ingredients', remapUser(ingredients)),
	buildInserts('ingredient_units', ingredientUnits),
	buildInserts('recipes', remapUser(recipes)),
	buildInserts('recipe_ingredients', recipeIngredients),
	buildInserts('meal_plans', remapUser(mealPlans)),
	buildInserts('meal_plan_inventory', mealPlanInventory),
	buildInserts('meal_plan_slots', mealPlanSlots),
	buildInserts('exercises', remapUserNullable(exercises)),
	buildInserts('exercise_muscles', exerciseMuscles),
	buildInserts('workouts', remapUser(workouts)),
	buildInserts('workout_exercises', workoutExercises),
	buildInserts('workout_sessions', remapUser(workoutSessions)),
	buildInserts('workout_logs', workoutLogs)
]
	.filter(Boolean)
	.join('\n')

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(__dirname, '..', '.migration-data.sql')
writeFileSync(sqlPath, sql)
console.log(`\nGenerated ${sql.split('\n').length} SQL statements → ${sqlPath}`)

// Execute against prod
console.log('\nApplying to production...')
try {
	const result = execSync(`${WRANGLER} d1 execute macromaxxing --remote --file="${sqlPath}"`, {
		encoding: 'utf8',
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
	console.log('Done!')
	console.log(result)
} catch (e) {
	const err = e as { stderr?: string; message: string }
	console.error('Failed:', err.stderr || err.message)
	process.exit(1)
}
