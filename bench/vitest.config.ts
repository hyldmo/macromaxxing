import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Bench-only stand-in for a root vitest.config.ts. `root` is set because this
// file lives in bench/; a root config would not need it. No Tailwind, no
// VitePWA, no React Router plugin — alias only.
export default defineConfig({
	root: repoRoot,
	resolve: {
		alias: {
			'~': path.resolve(repoRoot, 'src')
		}
	}
})
