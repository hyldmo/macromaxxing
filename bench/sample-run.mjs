import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const TIMEOUT_MS = 8 * 60 * 1000

const args = process.argv.slice(2)
const sep = args.indexOf('--')
if (sep < 0) {
	console.error(
		'usage: sample-run.mjs --label <name> --run <n> --out <file> --log <file> [--parser vitest|bun|node] -- <cmd...>'
	)
	process.exit(2)
}

function flag(name, fallback) {
	const index = args.indexOf(`--${name}`)
	if (index < 0 || index > sep) return fallback
	return args[index + 1]
}

const label = flag('label', 'run')
const run = Number(flag('run', '1'))
const outPath = flag('out')
const logPath = flag('log')
const parser = flag('parser', 'vitest')
const sampleMs = Number(flag('interval', '500'))
const command = args.slice(sep + 1)
if (!(outPath && logPath) || command.length === 0) {
	console.error('missing --out, --log, or command')
	process.exit(2)
}

mkdirSync(dirname(outPath), { recursive: true })
mkdirSync(dirname(logPath), { recursive: true })

function readStatus(pid) {
	try {
		const status = readFileSync(`/proc/${pid}/status`, 'utf8')
		const name = /^Name:\s+(\S+)/m.exec(status)?.[1] ?? ''
		const rssKb = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0)
		const ppid = Number(/^PPid:\s+(\d+)/m.exec(status)?.[1] ?? 0)
		return { pid, ppid, name, rssKb }
	} catch {
		return null
	}
}

function listProcs() {
	const procs = []
	for (const entry of readdirSync('/proc')) {
		if (!/^\d+$/.test(entry)) continue
		const proc = readStatus(Number(entry))
		if (proc) procs.push(proc)
	}
	return procs
}

function isRunnerProc(proc) {
	return proc.name === 'node' || proc.name === 'bun'
}

function snapshot(rootPid) {
	const procs = listProcs()
	const children = new Map()
	for (const proc of procs) {
		const list = children.get(proc.ppid)
		if (list) list.push(proc.pid)
		else children.set(proc.ppid, [proc.pid])
	}
	const tree = new Set()
	const stack = [rootPid]
	while (stack.length > 0) {
		const pid = stack.pop()
		if (pid === undefined || tree.has(pid)) continue
		tree.add(pid)
		const kids = children.get(pid)
		if (kids) stack.push(...kids)
	}
	let nodeRssKb = 0
	let nodeCount = 0
	const runners = []
	for (const proc of procs) {
		if (!(tree.has(proc.pid) && isRunnerProc(proc))) continue
		nodeRssKb += proc.rssKb
		nodeCount += 1
		runners.push(proc)
	}
	return { nodeRssKb, nodeCount, treeCount: tree.size, runners }
}

function cmdline(pid) {
	try {
		return readFileSync(`/proc/${pid}/cmdline`).toString().replaceAll('\0', ' ').trim().slice(0, 220)
	} catch {
		return ''
	}
}

function memAvailableKb() {
	try {
		const info = readFileSync('/proc/meminfo', 'utf8')
		return Number(/^MemAvailable:\s+(\d+)/m.exec(info)?.[1] ?? 0)
	} catch {
		return 0
	}
}

function countMatch(text, pattern) {
	const match = text.match(pattern)
	return match ? Number(match[1]) : null
}

function parseVitest(text) {
	const fileLine = text.match(/Test Files\s+([^\n]+)/)?.[1] ?? ''
	const testLine = text.match(/\n\s*Tests\s+([^\n]+)/)?.[1] ?? ''
	const pick = (line, word) => Number(line.match(new RegExp(`(\\d+)\\s+${word}`))?.[1] ?? 0)
	const total = line => Number(line.match(/\((\d+)\)/)?.[1] ?? 0)
	const durationS = text.match(/Duration\s+([\d.]+)s/)?.[1]
	return {
		filesPassed: pick(fileLine, 'passed'),
		filesFailed: pick(fileLine, 'failed'),
		filesSkipped: pick(fileLine, 'skipped'),
		filesTotal: total(fileLine),
		testsPassed: pick(testLine, 'passed'),
		testsFailed: pick(testLine, 'failed'),
		testsSkipped: pick(testLine, 'skipped'),
		testsTotal: total(testLine),
		reportedDurationMs: durationS ? Math.round(Number(durationS) * 1000) : null
	}
}

function parseBun(text) {
	const files = countMatch(text, /Ran\s+\d+\s+tests?\s+across\s+(\d+)\s+files?/)
	const tests = countMatch(text, /Ran\s+(\d+)\s+tests?\s+across/)
	const passed = countMatch(text, /^\s*(\d+)\s+pass\b/m)
	const failed = countMatch(text, /^\s*(\d+)\s+fail\b/m)
	const errors = countMatch(text, /^\s*(\d+)\s+error/m) ?? 0
	return {
		filesPassed: null,
		filesFailed: null,
		filesTotal: files,
		testsPassed: passed,
		testsFailed: failed === null ? null : failed + errors,
		testsTotal: tests,
		bunErrors: errors
	}
}

function parseNode(text) {
	const pick = word => countMatch(text, new RegExp(`^ℹ\\s+${word}\\s+(\\d+)`, 'm'))
	return {
		testsPassed: pick('pass'),
		testsFailed: pick('fail'),
		testsSkipped: pick('skipped'),
		testsTotal: pick('tests'),
		suites: pick('suites'),
		cancelled: pick('cancelled'),
		reportedDurationMs: (() => {
			const ms = text.match(/^ℹ\s+duration_ms\s+([\d.]+)/m)?.[1]
			return ms ? Math.round(Number(ms)) : null
		})()
	}
}

function parseOutput(text) {
	if (parser === 'bun') return parseBun(text)
	if (parser === 'node') return parseNode(text)
	if (parser === 'vitest') return parseVitest(text)
	return {}
}

function killTree(rootPid) {
	const snap = snapshot(rootPid)
	for (const proc of snap.runners) {
		try {
			process.kill(proc.pid, 'SIGKILL')
		} catch {
			// already gone
		}
	}
	try {
		process.kill(rootPid, 'SIGKILL')
	} catch {
		// already gone
	}
}

const started = process.hrtime.bigint()
const startedAt = new Date().toISOString()
const child = spawn(command[0], command.slice(1), {
	cwd: process.cwd(),
	env: process.env,
	stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', chunk => {
	output += chunk
})
child.stderr.on('data', chunk => {
	output += chunk
})

const samples = []
let peakNodeRssKb = 0
let peakNodeCount = 0
let peakTreeCount = 0
let peakRunners = []

function takeSample() {
	if (child.pid === undefined) return
	const snap = snapshot(child.pid)
	const tMs = Number(process.hrtime.bigint() - started) / 1e6
	samples.push({
		tMs: Math.round(tMs),
		nodeRssKb: snap.nodeRssKb,
		nodeCount: snap.nodeCount,
		treeCount: snap.treeCount,
		memAvailableKb: memAvailableKb()
	})
	if (snap.nodeRssKb >= peakNodeRssKb) {
		peakNodeRssKb = snap.nodeRssKb
		peakRunners = snap.runners.map(proc => ({
			pid: proc.pid,
			rssKb: proc.rssKb,
			name: proc.name,
			cmd: cmdline(proc.pid)
		}))
	}
	if (snap.nodeCount > peakNodeCount) peakNodeCount = snap.nodeCount
	if (snap.treeCount > peakTreeCount) peakTreeCount = snap.treeCount
}

takeSample()
const timer = setInterval(takeSample, sampleMs)
let timedOut = false
const killer = setTimeout(() => {
	timedOut = true
	killTree(child.pid)
}, TIMEOUT_MS)

child.on('close', code => {
	clearInterval(timer)
	clearTimeout(killer)
	takeSample()
	const wallMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6)
	writeFileSync(logPath, output)
	const result = {
		label,
		run,
		command,
		parser,
		sampleMs,
		startedAt,
		wallMs,
		exitCode: code,
		timedOut,
		peakNodeRssKb,
		peakNodeRssMb: Math.round((peakNodeRssKb / 1024) * 10) / 10,
		peakNodeCount,
		peakTreeCount,
		sampleCount: samples.length,
		peakRunners,
		parsed: parseOutput(output),
		samples
	}
	writeFileSync(outPath, JSON.stringify(result, null, 2))
	console.info(
		`${label}#${run} exit=${code} wall=${wallMs}ms peakRss=${result.peakNodeRssMb}MB peakProcs=${peakNodeCount} tree=${peakTreeCount}`
	)
	process.exit(0)
})
