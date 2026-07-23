/**
 * Headless render check for the MCP Apps widget. Builds src/mcp-widgets/fixture.html with the SAME
 * React + Tailwind pipeline the shipped widget uses, then inlines it into a single self-contained
 * /tmp/widget-fixture/fixture.inlined.html so a browser (Playwright / claude-in-chrome) can open it
 * via file:// and screenshot the real MuscleLoadPanel + BodyMap — proving the app's components render
 * and style correctly inside a standalone bundle. Does not exercise the MCP handshake (that's the
 * live claude.ai render).
 *
 *   node --experimental-transform-types scripts/verify-widget.ts
 *   # then open the printed file:// path in a browser and screenshot
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const widgetsDir = join(root, 'src/mcp-widgets')
const out = '/tmp/widget-fixture'

await build({
	configFile: false,
	root: widgetsDir,
	plugins: [react(), tailwind()],
	resolve: { alias: { '~': join(root, 'src') } },
	build: {
		outDir: out,
		emptyOutDir: true,
		assetsInlineLimit: 0,
		cssCodeSplit: false,
		modulePreload: false,
		rollupOptions: {
			input: join(widgetsDir, 'fixture.html'),
			output: { inlineDynamicImports: true, entryFileNames: 'w.js', assetFileNames: 'w.[ext]' }
		}
	}
})

const js = readFileSync(join(out, 'w.js'), 'utf8')
const css = readFileSync(join(out, 'w.css'), 'utf8')
const file = join(out, 'fixture.inlined.html')
writeFileSync(
	file,
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll('</script>', '<\\/script>')}</script></body></html>`
)

console.info(`✓ render fixture built — open file://${file} and screenshot`)
