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
	const escaped = sql.replaceAll('"', '\\"')
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
	return s.replaceAll("'", "''")
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

	// Group by description to aggregate samples (Foundation has multiple fdc_ids per food)
	const descGroups = new Map<string, { fdcIds: number[]; description: string }>()
	for (const [fdcId, food] of foodMap) {
		if (!macroMap.has(fdcId)) continue
		const key = food.description.toLowerCase()
		const group = descGroups.get(key)
		if (group) {
			group.fdcIds.push(fdcId)
		} else {
			descGroups.set(key, { fdcIds: [fdcId], description: food.description })
		}
	}

	// Build food data — average macros across samples, pick first fdc_id as representative
	const foods: FoodData[] = []
	for (const group of descGroups.values()) {
		const samples = group.fdcIds.map(id => macroMap.get(id)!).filter(Boolean)
		if (samples.length === 0) continue

		const avg = (key: keyof (typeof samples)[0]) => {
			const values = samples.map(s => s[key]).filter(v => v > 0)
			if (values.length === 0) return 0
			return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
		}

		const representativeFdcId = group.fdcIds[0]

		// Calculate density from volume portions (check all fdc_ids in group)
		let density: number | null = null
		for (const fdcId of group.fdcIds) {
			const portions = portionsMap.get(fdcId)
			if (portions) {
				for (const p of portions) {
					const ml = VOLUME_ML.get(p.name)
					if (ml) {
						density = Math.round((p.grams / ml) * 1000) / 1000
						break
					}
				}
				if (density !== null) break
			}
		}

		foods.push({
			fdcId: representativeFdcId,
			description: group.description,
			dataType: dataset.dataType,
			protein: avg('protein'),
			carbs: avg('carbs'),
			fat: avg('fat'),
			kcal: avg('kcal'),
			fiber: avg('fiber'),
			density
		})
	}

	// Map all fdc_ids to their representative fdc_id for portion remapping
	const fdcIdRemap = new Map<number, number>()
	for (const group of descGroups.values()) {
		const rep = group.fdcIds[0]
		for (const id of group.fdcIds) {
			fdcIdRemap.set(id, rep)
		}
	}

	// Collect portions, remapping to representative fdc_id and deduplicating
	const allPortions: PortionData[] = []
	const seenPortions = new Set<string>()
	for (const portions of portionsMap.values()) {
		for (const p of portions) {
			const repId = fdcIdRemap.get(p.fdcId)
			if (repId == null) continue
			const key = `${repId}:${p.name}`
			if (seenPortions.has(key)) continue
			seenPortions.add(key)
			allPortions.push({ ...p, fdcId: repId })
		}
	}

	return { foods, portions: allPortions }
}

async function main() {
	console.log(`Seeding USDA foods (${isLocal ? 'local' : 'remote'})...`)

	console.log('Clearing existing data...')
	exec('DELETE FROM usda_portions')
	exec('DELETE FROM usda_foods')

	let rawFoods: FoodData[] = []
	let rawPortions: PortionData[] = []

	for (const dataset of DATASETS) {
		const { foods, portions } = await processDataset(dataset)
		rawFoods = [...rawFoods, ...foods]
		rawPortions = [...rawPortions, ...portions]
	}
	console.log(`\nRaw: ${rawFoods.length} foods, ${rawPortions.length} portions`)

	// Deduplicate across datasets by description, merging macros (fill gaps from any source)
	const foodsByDesc = new Map<string, FoodData>()
	const MACRO_KEYS = ['protein', 'carbs', 'fat', 'kcal', 'fiber'] as const
	for (const food of rawFoods) {
		const key = food.description.toLowerCase()
		const existing = foodsByDesc.get(key)
		if (!existing) {
			foodsByDesc.set(key, { ...food })
		} else {
			for (const k of MACRO_KEYS) {
				if (existing[k] === 0 && food[k] > 0) existing[k] = food[k]
			}
			existing.density ??= food.density
		}
	}
	const allFoods = [...foodsByDesc.values()]

	// Remap portions to winning fdc_ids and deduplicate
	const fdcIdByDesc = new Map(allFoods.map(f => [f.description.toLowerCase(), f.fdcId]))
	const portionsSeen = new Set<string>()
	const allPortions: PortionData[] = []
	for (const p of rawPortions) {
		// Find the winning fdc_id for this portion's food
		const food = rawFoods.find(f => f.fdcId === p.fdcId)
		if (!food) continue
		const winId = fdcIdByDesc.get(food.description.toLowerCase())
		if (winId == null) continue
		const key = `${winId}:${p.name}`
		if (portionsSeen.has(key)) continue
		portionsSeen.add(key)
		allPortions.push({ ...p, fdcId: winId })
	}

	console.log(`Deduplicated: ${allFoods.length} foods, ${allPortions.length} portions`)

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
