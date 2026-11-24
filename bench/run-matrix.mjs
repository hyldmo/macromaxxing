import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, cpus, freemem, totalmem } from 'node:os'

const outDir = process.argv[2] ?? '/opt/cursor/artifacts/test-runner-bench'
const only = process.argv[3]
mkdirSync(outDir, { recursive: true })

const machine = {
	recordedAt: new Date().toISOString(),
	uname: readFileSync('/proc/sys/kernel/osrelease', 'utf8').trim(),
	model: cpus()[0]?.model ?? 'unknown',
	cpus: cpus().length,
	availableParallelism: availableParallelism(),
	totalMemBytes: totalmem(),
	freeMemBytes: freemem(),
	meminfo: Object.fromEntries(
		readFileSync('/proc/meminfo', 'utf8')
			.split('\n')
			.filter(line => /^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal):/.test(line))
			.map(line => {
				const [key, value] = line.split(':')
				return [key, value.trim()]
			})
	),
	node: process.version,
	vitestDefaultMaxWorkers: Math.max(availableParallelism() - 1, 1),
	note: 'balloon_inflate is in 4KiB pages. Guest MemTotal under-reports host RAM sitting in the balloon.'
}
try {
	const vmstat = readFileSync('/proc/vmstat', 'utf8')
	const inflate = Number(/balloon_inflate\s+(\d+)/.exec(vmstat)?.[1] ?? 0)
	const deflate = Number(/balloon_deflate\s+(\d+)/.exec(vmstat)?.[1] ?? 0)
	machine.balloonPages = inflate - deflate
	machine.balloonMiB = Math.round(((inflate - deflate) * 4) / 1024)
} catch {
	// no balloon on this kernel
}
writeFileSync(`${outDir}/machine.json`, JSON.stringify(machine, null, 2))

const configs = [
	{ label: 'baseline', parser: 'vitest', argv: ['yarn', 'test'] },
	{
		label: 'max4-forks',
		parser: 'vitest',
		argv: ['yarn', 'vitest', 'run', '--config', 'vite.config.ts', '--maxWorkers=4', '--pool=forks']
	},
	{
		label: 'max4-threads',
		parser: 'vitest',
		argv: ['yarn', 'vitest', 'run', '--config', 'vite.config.ts', '--maxWorkers=4', '--pool=threads']
	},
	{
		label: 'pct50-forks',
		parser: 'vitest',
		argv: ['yarn', 'vitest', 'run', '--config', 'vite.config.ts', '--maxWorkers=50%', '--pool=forks']
	},
	{
		label: 'pct50-threads',
		parser: 'vitest',
		argv: ['yarn', 'vitest', 'run', '--config', 'vite.config.ts', '--maxWorkers=50%', '--pool=threads']
	},
	{
		label: 'minimal-config',
		parser: 'vitest',
		argv: ['yarn', 'vitest', 'run', '--config', 'bench/vitest.config.ts']
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
if (selected.length === 0) {
	console.error(`unknown config ${only}`)
	process.exit(2)
}

for (const config of selected) {
	console.info(`\n=== ${config.label} warmup ===`)
	await runOne(config, 0)
	for (const run of [1, 2, 3]) {
		console.info(`\n=== ${config.label} run ${run} ===`)
		await runOne(config, run)
	}
}

console.info('matrix done')
