import { spawn } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const outDir = process.argv[2] ?? '/opt/cursor/artifacts/test-runner-bench'
const only = process.argv[3]
const bun = process.env.BUN_BIN ?? '/home/ubuntu/.bun/bin/bun'

function testFiles(dir, found = []) {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.yarn') continue
		const full = path.join(dir, entry)
		const info = statSync(full)
		if (info.isDirectory()) testFiles(full, found)
		else if (entry.endsWith('.test.ts')) found.push(full)
	}
	return found
}

const files = testFiles(process.cwd()).sort()
const configs = [
	{
		label: 'bun',
		parser: 'bun',
		argv: [bun, 'test', '--preload', './bench/bun/preload.ts']
	},
	{
		label: 'node',
		parser: 'node',
		argv: [process.execPath, '--import', './bench/node/register.mjs', '--test', '--test-reporter', 'spec', ...files]
	}
]

function runOne(config, run) {
	const out = `${outDir}/${config.label}-${run}.json`
	const log = `${outDir}/${config.label}-${run}.log`
	const child = spawn(
		process.execPath,
		[
			'bench/sample-run.mjs',
			'--label',
			config.label,
			'--run',
			String(run),
			'--out',
			out,
			'--log',
			log,
			'--parser',
			config.parser,
			'--',
			...config.argv
		],
		{ stdio: 'inherit' }
	)
	return new Promise(resolve => {
		child.on('close', code => resolve(code ?? 1))
	})
}

const selected = only ? configs.filter(config => config.label === only) : configs
for (const config of selected) {
	console.info(`\n=== ${config.label} warmup ===`)
	await runOne(config, 0)
	for (const run of [1, 2, 3]) {
		console.info(`\n=== ${config.label} run ${run} ===`)
		await runOne(config, run)
	}
}
console.info('alt done')
