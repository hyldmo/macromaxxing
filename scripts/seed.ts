/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
	Ingredient,
	IngredientUnit,
	MealPlan,
	MealPlanInventory,
	MealPlanSlot,
	Recipe,
	RecipeIngredient,
	User
} from '@macromaxxing/db'
import type { D1Row } from './types'

const WRANGLER = 'yarn workspace @macromaxxing/workers wrangler'
const USER_ID = 'user_39I5kFnlAoJmYkhH14BK4piLrxT'

function query<T>(sql: string): D1Row<T>[] {
	const escaped = sql.replaceAll('"', '\\"')
	const out = execSync(`${WRANGLER} d1 execute macromaxxing --local --json --command "${escaped}"`, {
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
			return `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`
		})
		.join('\n')
}

console.log('Exporting local data...')
const user = query<User>(`SELECT * FROM users WHERE id = '${USER_ID}'`)
const ingredients = query<Ingredient>(`SELECT * FROM ingredients WHERE user_id = '${USER_ID}'`)
const ingredientUnits = query<IngredientUnit>(
	`SELECT iu.* FROM ingredient_units iu JOIN ingredients i ON iu.ingredient_id = i.id WHERE i.user_id = '${USER_ID}'`
)
const recipes = query<Recipe>(`SELECT * FROM recipes WHERE user_id = '${USER_ID}'`)
const recipeIngredients = query<RecipeIngredient>(
	`SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON ri.recipe_id = r.id WHERE r.user_id = '${USER_ID}'`
)
const mealPlans = query<MealPlan>(`SELECT * FROM meal_plans WHERE user_id = '${USER_ID}'`)
const mealPlanInventory = query<MealPlanInventory>(
	`SELECT mpi.* FROM meal_plan_inventory mpi JOIN meal_plans mp ON mpi.meal_plan_id = mp.id WHERE mp.user_id = '${USER_ID}'`
)
const mealPlanSlots = query<MealPlanSlot>(
	`SELECT mps.* FROM meal_plan_slots mps JOIN meal_plan_inventory mpi ON mps.inventory_id = mpi.id JOIN meal_plans mp ON mpi.meal_plan_id = mp.id WHERE mp.user_id = '${USER_ID}'`
)

console.log(
	`  ${user.length} user, ${ingredients.length} ingredients, ${ingredientUnits.length} units, ${recipes.length} recipes, ${recipeIngredients.length} recipe_ingredients, ${mealPlans.length} meal_plans`
)

const sql = [
	'-- Seed data generated from local database',
	`-- User: ${USER_ID}`,
	'',
	buildInserts('users', user),
	buildInserts('ingredients', ingredients),
	buildInserts('ingredient_units', ingredientUnits),
	buildInserts('recipes', recipes),
	buildInserts('recipe_ingredients', recipeIngredients),
	buildInserts('meal_plans', mealPlans),
	buildInserts('meal_plan_inventory', mealPlanInventory),
	buildInserts('meal_plan_slots', mealPlanSlots)
]
	.filter(Boolean)
	.join('\n')

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(__dirname, 'seed.sql')
writeFileSync(sqlPath, sql)

const stmtCount = sql.split('\n').filter(l => l.startsWith('INSERT')).length
console.log(`\nGenerated ${stmtCount} INSERT statements → scripts/seed.sql`)
