import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'packages/db/drizzle')

for (const entry of readdirSync(migrationsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
	if (!entry.isDirectory()) continue
	const source = join(migrationsDir, entry.name, 'migration.sql')
	const destination = join(migrationsDir, `${entry.name}.sql`)
	if (!existsSync(source) || existsSync(destination)) continue

	const migration = readFileSync(source, 'utf8')
		.replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ')
		.replace(/^CREATE INDEX /gm, 'CREATE INDEX IF NOT EXISTS ')
		.replace(/^CREATE UNIQUE INDEX /gm, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
	writeFileSync(destination, migration)
	console.info(`Flattened ${entry.name}/migration.sql`)
}
