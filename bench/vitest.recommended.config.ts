import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// What a root vitest.config.ts should be. `root` is only here because the file
// lives under bench/; delete that one line when moving it to the repo root.
// Threads keep workers inside the Vitest process. maxWorkers stops a 24-core
// machine from multiplying isolates the way the default (cpus - 1, forks) does.
export default defineConfig({
	root: repoRoot,
	resolve: {
		alias: {
			'~': path.resolve(repoRoot, 'src')
		}
	},
	test: {
		pool: 'threads',
		maxWorkers: 4
	}
})
