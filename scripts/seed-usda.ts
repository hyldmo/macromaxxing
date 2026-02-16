/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */

import { execSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const WRANGLER = 'yarn workspace @macromaxxing/workers wrangler'
const CACHE_DIR = '.usda-cache'

// Latest USDA FDC CSV downloads
const DATASETS = [
	{
		name: 'Foundation Foods',
		dataType: 'foundation',
		url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip'
	},
	{
		name: 'SR Legacy',
		dataType: 'sr_legacy',
		url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip'
	}
] as const

// USDA nutrient IDs we care about
const NUTRIENT_IDS = {
	1003: 'protein',
	1004: 'fat',
	1005: 'carbs',
	1008: 'kcal',
	1079: 'fiber'
} as const

// Known unit names we recognize from USDA portion modifiers (matches ai-utils.ts)
const KNOWN_UNITS = new Set(['cup', 'tbsp', 'tsp', 'oz', 'lb', 'ml', 'dl', 'pcs', 'slice', 'large', 'medium', 'small'])

// Volume units with their ml equivalents (matches ai-utils.ts)
const VOLUME_ML = new Map([
	['ml', 1],
	['tsp', 5],
	['tbsp', 15],
	['dl', 100],
	['cup', 240]
])

const isLocal = !process.argv.includes('--remote')
const flag = isLocal ? '--local' : '--remote'

function exec(sql: string) {
	const escaped = sql.replace(/"/g, '\\"')
	execSync(`${WRANGLER} d1 execute macromaxxing ${flag} --command "${escaped}"`, {
		encoding: 'utf8',
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
}

function execBatch(sqlFile: string) {
	const absPath = resolve(process.cwd(), sqlFile)
	execSync(`${WRANGLER} d1 execute macromaxxing ${flag} --file="${absPath}"`, {
		encoding: 'utf8',
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	})
}

/** Parse a CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
	const fields: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"'
				i++ // skip escaped quote
			} else {
				inQuotes = !inQuotes
			}
		} else if (ch === ',' && !inQuotes) {
			fields.push(current)
			current = ''
		} else {
			current += ch
		}
	}
	fields.push(current)
	return fields
}

/** Parse CSV file into array of objects keyed by header */
function parseCSV(content: string): Array<Record<string, string>> {
	const lines = content.split('\n').filter(l => l.trim())
	if (lines.length === 0) return []

	const headers = parseCSVLine(lines[0])
	const rows: Array<Record<string, string>> = []

	for (let i = 1; i < lines.length; i++) {
		const values = parseCSVLine(lines[i])
		const row: Record<string, string> = {}
		for (let j = 0; j < headers.length; j++) {
			row[headers[j]] = values[j] ?? ''
		}
		rows.push(row)
	}

	return rows
}

async function downloadAndExtract(url: string, cacheKey: string): Promise<string> {
	const zipPath = `${CACHE_DIR}/${cacheKey}.zip`
	const extractDir = `${CACHE_DIR}/${cacheKey}`

	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true })
	}

	// Download if not cached
	if (!existsSync(zipPath)) {
		console.log(`  Downloading ${url}...`)
		const res = await fetch(url)
		if (!(res.ok && res.body)) {
			throw new Error(`Failed to download ${url}: ${res.status}`)
		}
		const stream = createWriteStream(zipPath)
		await pipeline(Readable.fromWeb(res.body as any), stream)
		console.log(`  Downloaded to ${zipPath}`)
	} else {
		console.log(`  Using cached ${zipPath}`)
	}

	// Extract if not already extracted
	if (!existsSync(extractDir)) {
		mkdirSync(extractDir, { recursive: true })
		execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })
		console.log(`  Extracted to ${extractDir}`)
	}

	return extractDir
}

/** Find a file in the extracted directory (may be nested) */
function findFile(dir: string, filename: string): string {
	const result = execSync(`find "${dir}" -name "${filename}" -type f`, { encoding: 'utf8' }).trim()
	if (!result) throw new Error(`${filename} not found in ${dir}`)
	return result.split('\n')[0]
}

/** Escape single quotes for SQL strings */
function sqlEscape(s: string): string {
	return s.replace(/'/g, "''")
}

interface FoodData {
	fdcId: number
	description: string
	dataType: string
	protein: number
	carbs: number
	fat: number
	kcal: number
	fiber: number
	density: number | null
}

interface PortionData {
	fdcId: number
	name: string
	grams: number
	isVolume: boolean
}

async function processDataset(dataset: (typeof DATASETS)[number]) {
	console.log(`\nProcessing ${dataset.name}...`)

	const dir = await downloadAndExtract(dataset.url, dataset.dataType)

	// Parse food.csv
	console.log('  Parsing food.csv...')
	const foodPath = findFile(dir, 'food.csv')
	const foodRows = parseCSV(readFileSync(foodPath, 'utf8'))
	const foodMap = new Map<number, { fdcId: number; description: string }>()

	for (const row of foodRows) {
		const fdcId = Number(row.fdc_id)
		if (Number.isNaN(fdcId)) continue
		foodMap.set(fdcId, { fdcId, description: row.description })
	}
	console.log(`  Found ${foodMap.size} foods`)

	// Parse food_nutrient.csv → extract 5 macro nutrients per food
	console.log('  Parsing food_nutrient.csv...')
	const nutrientPath = findFile(dir, 'food_nutrient.csv')
	const nutrientRows = parseCSV(readFileSync(nutrientPath, 'utf8'))
	const macroMap = new Map<number, { protein: number; carbs: number; fat: number; kcal: number; fiber: number }>()

	for (const row of nutrientRows) {
		const fdcId = Number(row.fdc_id)
		const nutrientId = Number(row.nutrient_id)
		const amount = Number(row.amount)

		if (Number.isNaN(fdcId) || Number.isNaN(amount)) continue

		const nutrientName = NUTRIENT_IDS[nutrientId as keyof typeof NUTRIENT_IDS]
		if (!nutrientName) continue

		if (!macroMap.has(fdcId)) {
			macroMap.set(fdcId, { protein: 0, carbs: 0, fat: 0, kcal: 0, fiber: 0 })
		}
		const macros = macroMap.get(fdcId)!
		macros[nutrientName] = Math.round(amount * 100) / 100
	}
	console.log(`  Extracted macros for ${macroMap.size} foods`)

	// Parse food_portion.csv → normalize unit names
	console.log('  Parsing food_portion.csv...')
	const portionPath = findFile(dir, 'food_portion.csv')
	const portionRows = parseCSV(readFileSync(portionPath, 'utf8'))
	const portionsMap = new Map<number, PortionData[]>()

	for (const row of portionRows) {
		const fdcId = Number(row.fdc_id)
		const gramWeight = Number(row.gram_weight)
		const amount = Number(row.amount)
		const modifier = row.modifier?.toLowerCase().trim()

		if (Number.isNaN(fdcId) || Number.isNaN(gramWeight) || Number.isNaN(amount) || !modifier || !amount) continue
		if (!KNOWN_UNITS.has(modifier)) continue

		const gramsPerUnit = Math.round((gramWeight / amount) * 100) / 100
		const isVolume = VOLUME_ML.has(modifier)

		if (!portionsMap.has(fdcId)) {
			portionsMap.set(fdcId, [])
		}

		// Deduplicate by name
		const existing = portionsMap.get(fdcId)!
		if (!existing.some(p => p.name === modifier)) {
			existing.push({ fdcId, name: modifier, grams: gramsPerUnit, isVolume })
		}
	}
	console.log(`  Extracted portions for ${portionsMap.size} foods`)

	// Build food data with density from volume portions
	const foods: FoodData[] = []
	for (const [fdcId, food] of foodMap) {
		const macros = macroMap.get(fdcId)
		if (!macros) continue // Skip foods with no nutrient data

		// Calculate density from volume portions
		let density: number | null = null
		const portions = portionsMap.get(fdcId)
		if (portions) {
			for (const p of portions) {
				const ml = VOLUME_ML.get(p.name)
				if (ml) {
					density = Math.round((p.grams / ml) * 1000) / 1000
					break
				}
			}
		}

		foods.push({
			fdcId,
			description: food.description,
			dataType: dataset.dataType,
			...macros,
			density
		})
	}

	// Collect all portions
	const allPortions: PortionData[] = []
	for (const portions of portionsMap.values()) {
		for (const p of portions) {
			// Only include portions for foods we're importing
			if (macroMap.has(p.fdcId)) {
				allPortions.push(p)
			}
		}
	}

	return { foods, portions: allPortions }
}

async function main() {
	console.log(`Seeding USDA foods (${isLocal ? 'local' : 'remote'})...`)

	let allFoods: FoodData[] = []
	let allPortions: PortionData[] = []

	for (const dataset of DATASETS) {
		const { foods, portions } = await processDataset(dataset)
		allFoods = [...allFoods, ...foods]
		allPortions = [...allPortions, ...portions]
	}

	console.log(`\nTotal: ${allFoods.length} foods, ${allPortions.length} portions`)

	// Write SQL to temp file and execute in batches
	const BATCH_SIZE = 500
	let totalFoodsInserted = 0
	let totalPortionsInserted = 0

	// Insert foods in batches
	console.log('\nInserting foods...')
	for (let i = 0; i < allFoods.length; i += BATCH_SIZE) {
		const batch = allFoods.slice(i, i + BATCH_SIZE)
		const values = batch
			.map(
				f =>
					`(${f.fdcId}, '${sqlEscape(f.description)}', '${f.dataType}', ${f.protein}, ${f.carbs}, ${f.fat}, ${f.kcal}, ${f.fiber}, ${f.density ?? 'NULL'})`
			)
			.join(',\n')

		const sql = `INSERT OR REPLACE INTO usda_foods (fdc_id, description, data_type, protein, carbs, fat, kcal, fiber, density) VALUES\n${values};`

		const tmpFile = `${CACHE_DIR}/batch_foods_${i}.sql`
		const { writeFileSync } = await import('node:fs')
		writeFileSync(tmpFile, sql)
		execBatch(tmpFile)
		totalFoodsInserted += batch.length
		process.stdout.write(`  ${totalFoodsInserted}/${allFoods.length}\r`)
	}
	console.log(`  ${totalFoodsInserted} foods inserted`)

	// Insert portions in batches
	console.log('Inserting portions...')
	for (let i = 0; i < allPortions.length; i += BATCH_SIZE) {
		const batch = allPortions.slice(i, i + BATCH_SIZE)
		const values = batch
			.map(p => `(${p.fdcId}, '${sqlEscape(p.name)}', ${p.grams}, ${p.isVolume ? 1 : 0})`)
			.join(',\n')

		const sql = `INSERT OR REPLACE INTO usda_portions (fdc_id, name, grams, is_volume) VALUES\n${values};`

		const tmpFile = `${CACHE_DIR}/batch_portions_${i}.sql`
		const { writeFileSync } = await import('node:fs')
		writeFileSync(tmpFile, sql)
		execBatch(tmpFile)
		totalPortionsInserted += batch.length
		process.stdout.write(`  ${totalPortionsInserted}/${allPortions.length}\r`)
	}
	console.log(`  ${totalPortionsInserted} portions inserted`)

	// Rebuild FTS5 index
	console.log('Rebuilding FTS5 index...')
	exec("INSERT INTO usda_foods_fts(usda_foods_fts) VALUES('rebuild')")
	console.log('  FTS5 index rebuilt')

	console.log('\nDone!')
}

main().catch(err => {
	console.error('Error:', err)
	process.exit(1)
})
