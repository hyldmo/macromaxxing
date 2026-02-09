/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Ingredient, IngredientUnit, Recipe, RecipeIngredient } from '@macromaxxing/db'
import type { D1Row } from './types'

const LOCAL_USER = 'user_39I5kFnlAoJmYkhH14BK4piLrxT'
const PROD_USER = 'user_39RDb27BgKave26JTw4nvsUYP8L'
const WRANGLER = 'yarn workspace @macromaxxing/workers wrangler'
const ACCOUNT_ID = 'c8c7ccb7eeb85a9f45d757ad57cae67b'

function query<T>(sql: string, remote = false): D1Row<T>[] {
	const flag = remote ? '--remote' : '--local'
	const env = remote ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID } : undefined
	const escaped = sql.replace(/"/g, '\\"')
	const out = execSync(`${WRANGLER} d1 execute macromaxxing ${flag} --json --command "${escaped}"`, {
		encoding: 'utf8',
		env,
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
	return (JSON.parse(out) as [{ results: D1Row<T>[] }])[0].results
}

function sqlVal(v: unknown): string {
	if (v === null || v === undefined || v === 'null') return 'NULL'
	if (typeof v === 'number') return String(v)
	return `'${String(v).replace(/'/g, "''")}'`
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

function remapUser<T extends { user_id: string }>(rows: T[]): T[] {
	return rows.map(row => ({ ...row, user_id: PROD_USER }))
}

// Export local data
console.log('Exporting local data...')
const ingredients = query<Ingredient>(`SELECT * FROM ingredients WHERE user_id = '${LOCAL_USER}'`)
const ingredientUnits = query<IngredientUnit>(
	`SELECT iu.* FROM ingredient_units iu JOIN ingredients i ON iu.ingredient_id = i.id WHERE i.user_id = '${LOCAL_USER}'`
)
const recipes = query<Recipe>(`SELECT * FROM recipes WHERE user_id = '${LOCAL_USER}'`)
const recipeIngredients = query<RecipeIngredient>(
	`SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON ri.recipe_id = r.id WHERE r.user_id = '${LOCAL_USER}'`
)

console.log(
	`  ${ingredients.length} ingredients, ${ingredientUnits.length} units, ${recipes.length} recipes, ${recipeIngredients.length} recipe_ingredients`
)

// Build SQL - order matters for foreign keys
const sql = [
	buildInserts('ingredients', remapUser(ingredients)),
	buildInserts('ingredient_units', ingredientUnits),
	buildInserts('recipes', remapUser(recipes)),
	buildInserts('recipe_ingredients', recipeIngredients)
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
	const result = execSync(
		`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} ${WRANGLER} d1 execute macromaxxing --remote --file="${sqlPath}"`,
		{ encoding: 'utf8', cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] }
	)
	console.log('Done!')
	console.log(result)
} catch (e) {
	const err = e as { stderr?: string; message: string }
	console.error('Failed:', err.stderr || err.message)
	process.exit(1)
}
