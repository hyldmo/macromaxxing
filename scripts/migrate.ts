/** biome-ignore-all lint/suspicious/noConsole: <console is fine for scripts> */
/**
 * Apply Drizzle migrations to a D1 database.
 *
 * Wrangler's `d1 migrations apply` only handles flat *.sql files in
 * `migrations_dir`, but Drizzle v1 generates `<tag>/migration.sql`
 * subdirectories — wrangler silently ignores them and prints "✅ No migrations
 * to apply!" while leaving the database missing tables. This script bridges the
 * gap: enumerate subdirectory migrations, diff against `d1_migrations`, and
 * apply the missing ones via `d1 execute --file=...`.
 *
 * Usage:
 *   yarn tsx scripts/migrate.ts            # local
 *   yarn tsx scripts/migrate.ts --remote   # production
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REMOTE = process.argv.includes('--remote')
const FLAG = REMOTE ? '--remote' : '--local'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'packages', 'db', 'drizzle')

interface D1Row {
	name: string
}

function wrangler(...args: string[]): string {
	return execFileSync(
		'yarn',
		['workspace', '@macromaxxing/workers', 'wrangler', 'd1', 'execute', 'macromaxxing', FLAG, ...args],
		{ encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
	)
}

function applied(): Set<string> {
	const out = wrangler('--json', '--command', 'SELECT name FROM d1_migrations')
	const parsed = JSON.parse(out) as [{ results: D1Row[] }]
	return new Set(parsed[0].results.map(r => r.name))
}

function discover(): { tag: string; sql: string }[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter(entry => statSync(join(MIGRATIONS_DIR, entry)).isDirectory())
		.map(tag => ({ tag, sql: join(MIGRATIONS_DIR, tag, 'migration.sql') }))
		.sort((a, b) => a.tag.localeCompare(b.tag))
}

function applyOne(tag: string, sqlPath: string): void {
	console.log(`  applying ${tag}.sql ...`)
	wrangler('--file', sqlPath)
	wrangler('--command', `INSERT INTO d1_migrations (name) VALUES ('${tag}.sql')`)
}

function main(): void {
	console.log(`Migrating ${REMOTE ? 'REMOTE prod' : 'local'} D1...`)
	const done = applied()
	const all = discover()
	const pending = all.filter(m => !done.has(`${m.tag}.sql`))

	if (pending.length === 0) {
		console.log(`✓ Up to date (${done.size} migrations applied)`)
		return
	}

	console.log(`Found ${pending.length} pending migration(s):`)
	for (const m of pending) console.log(`  - ${m.tag}`)

	for (const m of pending) applyOne(m.tag, m.sql)

	console.log(`✓ Applied ${pending.length} migration(s)`)
}

main()
